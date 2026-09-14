'use server';

import { redirect } from 'next/navigation';

import { MIN_PASSWORD } from '@/components/entry-shell';
import { afterSignIn } from '@/lib/after-auth';
import { emailFault } from '@/lib/auth';
import { CODE_REFUSED, codeFault, digitsOf } from '@/lib/verify';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

import { siteUrl } from '../robots';

export type SignUpState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'fields'; readonly message: string; readonly field: 'email' | 'password' }
  /**
   * A31: the same sentence whether the address has an account or not, so the
   * form cannot be used to find out who does.
   */
  | { readonly kind: 'exists' }
  | { readonly kind: 'sent'; readonly email: string }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Create the account.
 *
 * Two fields, because business name is step 1 of the wizard and asking here
 * would ask twice. The organisation, its outlet and the owner membership are
 * created by a trigger on auth.users, so an account cannot exist without the
 * membership that makes it able to see anything.
 */
export async function createAccount(email: string, password: string): Promise<SignUpState> {
  const shape = emailFault(email);
  if (shape !== null) return { kind: 'fields', message: shape.message, field: 'email' };

  if (password.length < MIN_PASSWORD) {
    return {
      kind: 'fields',
      field: 'password',
      message: `${MIN_PASSWORD} characters or more. Nothing else.`,
    };
  }

  /*
   * No project wired up: the in-memory book has one operator and this is them.
   *
   * It used to return `sent`, which put "We've sent a link to <address>" in
   * front of somebody when nothing had been sent and no account had been made.
   * There is nowhere for a link to arrive from in this path — there is no mail
   * provider and no row. Setting up the book is the honest next screen.
   */
  if (!supabaseConfigured()) redirect(await afterSignIn(null));

  const supabase = await supabaseServer();
  /*
   * Where the confirmation link comes back to.
   *
   * Without this the link lands on Supabase's own site URL, which is fine for
   * a project whose site URL is this application and wrong the moment it is
   * not — and it carries a one-time credential that only our handler knows
   * what to do with. Named here rather than assumed there.
   */
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });

  if (error !== null) {
    const message = error.message.toLowerCase();
    if (message.includes('already') || message.includes('registered')) return { kind: 'exists' };
    return { kind: 'failed', message: error.message };
  }

  // Email confirmation is off, so a session arrives with the account and the
  // next stop is setting up the book.
  // A new account has four unanswered questions, so this lands on /setup —
  // but it says so by asking, not by knowing.
  if (data.session !== null) redirect(await afterSignIn(null));

  /*
   * No session means the project has email confirmation switched on, which it
   * is not today. Reaching this line therefore means somebody turned it on in
   * the Supabase dashboard — and that they could only have done so with a mail
   * provider configured, so the link the next screen describes is real.
   */
  return { kind: 'sent', email };
}

/**
 * Prove the address with the code from the mail.
 *
 * `verifyOtp` is the same call the link handler makes — a link and a code are
 * two spellings of one token — but nothing fetches a code on the reader's
 * behalf, which is the whole point of preferring it (see lib/verify.ts).
 *
 * A success writes the session, so this ends where sign-in ends: inside,
 * rather than back at a form asking them to type the password they chose two
 * minutes ago.
 */
export async function confirmSignUp(
  email: string,
  code: string,
): Promise<{ readonly kind: 'fields'; readonly message: string }> {
  const fault = codeFault(code);
  if (fault !== null) return { kind: 'fields', message: fault };

  if (!supabaseConfigured()) redirect(await afterSignIn(null));

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: digitsOf(code),
    type: 'signup',
  });

  /*
   * One sentence for every refusal. Expired, mistyped and already-spent are
   * the same situation to the person holding the code, and the provider does
   * not reliably say which — a guess dressed as a diagnosis is worse than the
   * one instruction that always applies.
   */
  if (error !== null) return { kind: 'fields', message: CODE_REFUSED };

  redirect(await afterSignIn(null));
}

/**
 * Send the confirmation mail again.
 *
 * Only reachable from the screen above, which is only reachable when the
 * project requires confirmation — so there is a provider behind this. It used
 * to be a `setInterval` in the browser that counted down from 45 and sent
 * nothing at all, which meant the one button on that screen for somebody whose
 * mail had not arrived did nothing but look busy.
 */
export async function resendSignUp(
  email: string,
): Promise<{ readonly ok: boolean; readonly message?: string }> {
  if (!supabaseConfigured()) return { ok: false, message: 'No mail is configured.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm` },
  });
  if (error !== null) return { ok: false, message: error.message };
  return { ok: true };
}

/** Sign out. The book stays; the session does not. */
export async function signOut(): Promise<void> {
  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  redirect('/sign-in');
}

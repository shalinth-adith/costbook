'use server';

import { redirect } from 'next/navigation';

import { MIN_PASSWORD } from '@/components/entry-shell';
import { afterSignIn } from '@/lib/after-auth';
import { emailFault } from '@/lib/auth';
import { sendSignupCode } from '@/lib/send-code';
import { CODE_REFUSED, codeFault, digitsOf } from '@/lib/verify';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';


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

  /*
   * The account is made and the code is posted by us, not by the provider.
   *
   * `auth.signUp` asks Supabase to send its own mail from a template in the
   * dashboard — which for a week said "follow this link" while this screen
   * asked for six digits, because the two live in different places and
   * nothing in this repository could make them agree. See lib/send-code.ts.
   */
  const out = await sendSignupCode({ email, password });

  // A31: the same sentence whether the address has an account or not.
  if (out.exists) return { kind: 'exists' };
  if (!out.ok) {
    return {
      kind: 'failed',
      message: 'We could not send the code just now. Try again in a moment.',
    };
  }

  /*
   * Always the code screen.
   *
   * The account exists and is unconfirmed, which is the state this flow is
   * for: there is no session to fall into, because nothing has proved the
   * address yet.
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
): Promise<
  | { readonly kind: 'fields'; readonly message: string }
  /**
   * Confirmed, and where to go. Returned rather than redirected so the screen
   * can say so first: a code that worked used to cut straight to setup, and
   * with nothing between "Confirm" and a wholly different page, the person
   * who had just typed six digits could not tell the two apart.
   */
  | { readonly kind: 'verified'; readonly next: string }
> {
  const fault = codeFault(code);
  if (fault !== null) return { kind: 'fields', message: fault };

  if (!supabaseConfigured()) return { kind: 'verified', next: await afterSignIn(null) };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: digitsOf(code),
    /*
     * The type the code was minted as — lib/send-code.ts asks for a magiclink
     * code both when the account is created and when another is sent, so this
     * screen verifies one thing rather than guessing which arrived.
     */
    type: 'magiclink',
  });

  /*
   * One sentence for every refusal. Expired, mistyped and already-spent are
   * the same situation to the person holding the code, and the provider does
   * not reliably say which — a guess dressed as a diagnosis is worse than the
   * one instruction that always applies.
   */
  if (error !== null) {
    /*
     * Logged, because the screen deliberately will not say which it was.
     *
     * The provider answers `otp_expired` for expired, mistyped AND superseded
     * alike, so there is nothing honest to put on the screen — but without a
     * line here there is nothing to read afterwards either, and the first time
     * somebody reported a refused code it had to be reconstructed from the
     * mail provider's outbox. The address and the code stay out of the log.
     */
    console.warn(`[auth] sign-up code refused: ${error.code ?? String(error.status)}`);
    return { kind: 'fields', message: CODE_REFUSED };
  }

  return { kind: 'verified', next: await afterSignIn(null) };
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
  const out = await sendSignupCode({ email });
  return out.ok
    ? { ok: true }
    : { ok: false, message: 'That did not send. Try again in a moment.' };
}

/** Sign out. The book stays; the session does not. */
export async function signOut(): Promise<void> {
  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  redirect('/sign-in');
}

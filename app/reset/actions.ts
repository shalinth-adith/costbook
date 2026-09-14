'use server';

import { redirect } from 'next/navigation';

import { afterSignIn } from '@/lib/after-auth';
import { emailFault } from '@/lib/auth';
import { passwordFault } from '@/lib/password';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

import { siteUrl } from '../robots';

export type ResetState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'fields'; readonly message: string }
  /** The only other answer there is. See RESET_SENT in lib/recover.ts. */
  | { readonly kind: 'sent' };

/**
 * Ask for a link.
 *
 * There is exactly one reply. Not "we sent it" and not "no such account" —
 * one sentence that is true either way, because the alternative is a form
 * anybody can use to find out which addresses have accounts. A refused
 * address would also tell somebody trying addresses from a breach list which
 * of their café's staff are here.
 *
 * The shape of the address is still checked, because "sent a link to
 * `steve@@gmail`" is not privacy, it is a typo nobody was told about.
 */
export async function requestReset(
  _previous: ResetState,
  form: FormData,
): Promise<ResetState> {
  const email = String(form.get('email') ?? '').trim();

  const shape = emailFault(email);
  if (shape !== null) return { kind: 'fields', message: shape.message };

  if (!supabaseConfigured()) return { kind: 'sent' };

  const supabase = await supabaseServer();
  /*
   * The link comes back to our own handler, carrying where to go next.
   *
   * Not to /reset/new directly: the link arrives with a one-time credential
   * that has to be exchanged for a session before any screen can do anything,
   * and only a route handler can write the cookie that results.
   */
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent('/reset/new')}`,
  });

  /*
   * The result is deliberately not read. Supabase returns the same shape for
   * an address it has never seen, and a branch here — even a branch that only
   * logged — would be the beginning of the leak this whole function avoids.
   */
  return { kind: 'sent' };
}

export type ChooseState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'fields'; readonly message: string }
  | { readonly kind: 'expired' }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Choose the new password.
 *
 * Reachable only with the session the recovery link created, which is what
 * makes it safe: the link proved the address, the session carries the proof,
 * and this changes the password on whoever that session belongs to. It never
 * takes an address — a screen that did could change somebody else's.
 */
export async function chooseNewPassword(
  _previous: ChooseState,
  form: FormData,
): Promise<ChooseState> {
  const password = String(form.get('password') ?? '');

  const fault = passwordFault(password);
  if (fault !== null) return { kind: 'fields', message: fault };

  if (!supabaseConfigured()) return { kind: 'expired' };

  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  // The link has been used, or an hour passed while this screen sat open.
  if (auth.user === null) return { kind: 'expired' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error !== null) return { kind: 'failed', message: error.message };

  /*
   * Straight in, not back to the sign-in screen.
   *
   * Being asked to type the password you chose four seconds ago is the most
   * common small cruelty in this flow, and the session that changed it is
   * already a signed-in session.
   */
  redirect(await afterSignIn(null));
}

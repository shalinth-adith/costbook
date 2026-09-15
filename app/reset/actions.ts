'use server';

import { redirect } from 'next/navigation';

import { afterSignIn } from '@/lib/after-auth';
import { emailFault } from '@/lib/auth';
import { passwordFault } from '@/lib/password';
import { sessionProvedByCode } from '@/lib/proved';
import { sendRecoveryCode } from '@/lib/send-code';
import { CODE_REFUSED, codeFault, digitsOf } from '@/lib/verify';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';


export type ResetState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'fields'; readonly message: string }
  /**
   * The only other answer there is (see RESET_SENT in lib/recover.ts), and it
   * carries the address so the code step need not ask for it a second time.
   */
  | { readonly kind: 'sent'; readonly email: string };

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

  if (!supabaseConfigured()) return { kind: 'sent', email };

  /*
   * The code is generated and posted by us, for the same reason sign-up's is:
   * a dashboard template cannot be kept in step with this screen. See
   * lib/send-code.ts.
   */
  await sendRecoveryCode(email);

  /*
   * The result is deliberately not read. An address with no account fails
   * inside that call and says so in the log; a branch here — even one that
   * only logged — would be the beginning of the leak this function exists to
   * avoid.
   */
  return { kind: 'sent', email };
}

/**
 * Prove the address with the code from the recovery mail.
 *
 * `type: 'recovery'` rather than `'signup'` — the same call, a different
 * token family. A success writes a session, which is what makes the next
 * screen safe: /reset/new changes the password of whoever the session
 * belongs to and never takes an address.
 */
export async function confirmReset(
  email: string,
  code: string,
): Promise<{ readonly kind: 'fields'; readonly message: string }> {
  const fault = codeFault(code);
  if (fault !== null) return { kind: 'fields', message: fault };

  if (!supabaseConfigured()) redirect('/reset/new');

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token: digitsOf(code),
    type: 'recovery',
  });
  if (error !== null) {
    // Same reason as sign-up's: the screen cannot say which, so the log must.
    console.warn(`[auth] recovery code refused: ${error.code ?? String(error.status)}`);
    return { kind: 'fields', message: CODE_REFUSED };
  }

  redirect('/reset/new');
}

/**
 * Send another recovery code.
 *
 * The refusal message tells people to ask for another one; until this existed
 * the screen gave them nothing to ask with, and the only way forward was to
 * start the whole flow again from the address field.
 *
 * It answers the same way for every address, like `requestReset` does.
 */
export async function resendReset(email: string): Promise<{ readonly ok: boolean }> {
  const shape = emailFault(email);
  if (shape !== null) return { ok: false };
  if (!supabaseConfigured()) return { ok: true };
  await sendRecoveryCode(email);
  return { ok: true };
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
  // The code has been used, or an hour passed while this screen sat open.
  if (auth.user === null) return { kind: 'expired' };
  /*
   * And it has to be a session that typed a code, this hour. A password
   * sign-in reaching this action — the screen refuses it too, but a screen
   * is a courtesy — is somebody at an open laptop, not somebody who has
   * proved the address. See lib/proved.ts.
   */
  if (!(await sessionProvedByCode(supabase))) return { kind: 'expired' };

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

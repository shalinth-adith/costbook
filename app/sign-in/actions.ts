'use server';

import { redirect } from 'next/navigation';

import {
  attemptsFor,
  directory,
  lookup,
  markVerificationSent,
  recordAttempts,
  verify,
} from '@/lib/accounts';
import { type SignInState, nextAttempts, signIn } from '@/lib/auth';

/**
 * The password is compared here and nowhere else.
 *
 * Shape errors are re-checked server-side even though the form checks them on
 * blur — the browser's copy of that rule is a courtesy, not a gate.
 */
export async function attemptSignIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '');
  const password = String(form.get('password') ?? '');
  const now = Date.now();

  const result = signIn(email, password, {
    account: lookup(email),
    passwordMatches: verify(email, password),
    directory: directory(),
    attempts: attemptsFor(email),
    now,
  });

  if (result.kind !== 'fields') {
    recordAttempts(email, nextAttempts(attemptsFor(email), result, now));
  }

  if (result.kind === 'ok') {
    // No session yet — that arrives with Supabase Auth at build step 12.
    // Until then the redirect is the whole of "you are in".
    redirect('/');
  }

  return result;
}

/**
 * A10 · 06, "Send it again". Real against the fixture: it moves the timestamp
 * so the card stops saying "four days ago". The mail itself waits for the
 * backend — nothing here claims to have sent one.
 */
export async function resendVerification(email: string): Promise<{ readonly sentAt: number }> {
  markVerificationSent(email);
  return { sentAt: Date.now() };
}

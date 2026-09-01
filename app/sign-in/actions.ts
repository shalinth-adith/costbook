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
import { type SignInState, emailFault, nextAttempts, signIn } from '@/lib/auth';
import { afterSignIn } from '@/lib/after-auth';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

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

  const next = typeof form.get('next') === 'string' ? (form.get('next') as string) : null;

  if (supabaseConfigured()) return await signInWithSupabase(email, password, next);

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
    // Where they go is not this file's decision. It authenticates, and then
    // asks the one function that knows.
    redirect(await afterSignIn(next));
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


/**
 * Sign in for real.
 *
 * A10 asks for eight states and Supabase answers with one message, so the
 * distinctions it does draw are kept and the rest collapse honestly. In
 * particular an unknown address and a wrong password come back identically —
 * which is correct, and deliberate on Supabase's part: a sign-in screen that
 * tells you an address is unknown is a screen that tells anybody which
 * addresses have accounts.
 *
 * The near-miss suggestion in A10 · 05 therefore cannot be offered against a
 * real directory, and is not faked.
 */
async function signInWithSupabase(
  email: string,
  password: string,
  next: string | null,
): Promise<SignInState> {
  const faults = [
    ...(email.trim() === '' ? [{ field: 'email' as const, message: 'Your email address goes here.' }] : []),
    ...(password === '' ? [{ field: 'password' as const, message: 'And your password.' }] : []),
  ];
  if (faults.length > 0) return { kind: 'fields', faults };

  const shape = emailFault(email);
  if (shape !== null) return { kind: 'fields', faults: [shape] };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error === null) redirect(await afterSignIn(next));

  const message = error.message.toLowerCase();

  // Supabase rate-limits rather than locking an account. Same consequence for
  // the operator, so it lands on the state written for it.
  if (message.includes('rate limit') || message.includes('too many')) {
    return { kind: 'locked', unlocksInMs: 60_000 };
  }
  if (message.includes('confirm')) {
    return { kind: 'unverified', email, sentDaysAgo: null };
  }

  // Everything else is "those two do not go together", which is the only thing
  // it is safe to say.
  return { kind: 'wrong-password', triesLeft: 0 };
}

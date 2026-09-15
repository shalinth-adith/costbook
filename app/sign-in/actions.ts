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
import { sendSignupCode } from '@/lib/send-code';
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
 * A10 · 06, "send a new code".
 *
 * Reachable by anybody, with any address, so it says nothing about whether
 * the address has an account — and, since the audit of 2026-09-15, it can no
 * longer create one: lib/send-code.ts checks first, and counts.
 */
export async function resendVerification(email: string): Promise<{ readonly sentAt: number }> {
  if (!supabaseConfigured()) {
    markVerificationSent(email);
    return { sentAt: Date.now() };
  }

  /*
   * The same code the sign-up screen sends, posted the same way — see
   * lib/send-code.ts. Deliberately quiet about whether the address has an
   * account: this screen is reachable by anybody.
   */
  await sendSignupCode({ email });
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
    /*
     * The password matched — the provider checks that before it mentions
     * confirmation — so the account is theirs and only the address is
     * unproven. Post the code now rather than making them ask: the screen
     * that follows is a code field, and a code field with no code on its way
     * is the dead end this used to be ("we sent a link", when nothing had
     * been sent and links were no longer a thing this product posts).
     */
    const posted = await sendSignupCode({ email });
    return { kind: 'unverified', email, sentDaysAgo: null, sent: posted.ok };
  }

  /*
   * Everything else is "those two do not go together", which is the only thing
   * it is safe to say — and `null` because it is also the only thing we know.
   *
   * This used to return 0, and the form printed "0 tries left before we lock
   * the account for 15 minutes" on the very first wrong password. Both halves
   * were false: nothing was about to lock, and no count was being kept.
   * Supabase rate-limits on its own terms and does not report a remaining
   * number. FLOWS 8 asks that a lockout reassure rather than accuse, and a
   * threat that is not even true is the wrong end of that.
   */
  return { kind: 'wrong-password', triesLeft: null };
}

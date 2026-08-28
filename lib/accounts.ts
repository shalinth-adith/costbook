/**
 * The people who can sign in, until Supabase Auth arrives at build step 12.
 *
 * This is the same stand-in that `lib/data.ts` is for the kitchen: enough real
 * shape to render every state the design draws, and nothing that could be
 * mistaken for a credential store. Passwords sit here in the open because
 * there is no point pretending otherwise — which is exactly why the module
 * refuses to answer at all outside development.
 *
 * Replacing it means implementing `lookup` and `verify` against
 * `supabase.auth.signInWithPassword` and deleting the rest. Nothing else in
 * the sign-in flow knows this file exists.
 */

import type { Account } from './auth';

const DAY = 24 * 60 * 60 * 1000;

interface FixtureAccount extends Account {
  readonly password: string;
}

/**
 * The three states the entry screen needs to demonstrate: a verified owner,
 * a manager who never opened her link (A10 · 06), and the standard dev-login
 * account this workspace uses for automated verification.
 */
const FIXTURE: readonly FixtureAccount[] = [
  {
    email: 'rk@srikrishnacafe.in',
    password: 'filtercoffee',
    verifiedAt: Date.now() - 90 * DAY,
    verificationSentAt: Date.now() - 90 * DAY,
  },
  {
    email: 'meena@srikrishnacafe.in',
    password: 'kuruma90g',
    verifiedAt: null,
    verificationSentAt: Date.now() - 4 * DAY,
  },
  {
    email: 'admin@thebrewapps.com',
    password: 'thebrewapps',
    verifiedAt: Date.now() - 30 * DAY,
    verificationSentAt: Date.now() - 30 * DAY,
  },
];

/**
 * A fixture that answered in production would be a sign-in screen that lets
 * three known passwords into a real kitchen's costs. It throws instead — a
 * deploy that has not wired Supabase fails loudly at the first sign-in rather
 * than quietly admitting anybody.
 */
function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'No auth backend is wired. The fixture directory in lib/accounts.ts is ' +
        'development-only — connect Supabase Auth before deploying (TRD §11, step 12).',
    );
  }
}

/** Every address we know, for the near-miss suggestion. Never sent to the browser. */
export function directory(): readonly string[] {
  assertNotProduction();
  return FIXTURE.map((a) => a.email);
}

export function lookup(email: string): Account | null {
  assertNotProduction();
  const found = FIXTURE.find((a) => a.email === email.trim().toLowerCase());
  if (found === undefined) return null;
  return {
    email: found.email,
    verifiedAt: found.verifiedAt,
    verificationSentAt: RESENT.get(found.email) ?? found.verificationSentAt,
  };
}

export function verify(email: string, password: string): boolean {
  assertNotProduction();
  const found = FIXTURE.find((a) => a.email === email.trim().toLowerCase());
  return found !== undefined && found.password === password;
}

/**
 * The attempt ledger, in memory.
 *
 * Per process and lost on restart, which is wrong in every way that matters
 * for a lockout — but the policy it feeds (`lib/auth.ts`) is the part being
 * built, and it is storage-agnostic. Supabase Auth brings its own rate
 * limiting; this exists so state 04 is reachable in development.
 */
const LEDGER = new Map<string, { wrong: number; lockedUntil: number | null }>();

export function attemptsFor(email: string): { wrong: number; lockedUntil: number | null } {
  return LEDGER.get(email.trim().toLowerCase()) ?? { wrong: 0, lockedUntil: null };
}

export function recordAttempts(
  email: string,
  attempts: { wrong: number; lockedUntil: number | null },
): void {
  LEDGER.set(email.trim().toLowerCase(), attempts);
}

/** Moves the "we sent it N days ago" clock. The mail itself needs the backend. */
const RESENT = new Map<string, number>();

export function markVerificationSent(email: string): void {
  assertNotProduction();
  RESENT.set(email.trim().toLowerCase(), Date.now());
}

/**
 * The sign-in decision, as plain data.
 *
 * This module owns the *policy* — which state the form enters and in what
 * order the checks run — and nothing else. It does not hash, does not compare
 * a password, does not touch a database, and does not import React or Next.
 * The caller establishes the facts; this decides what they mean.
 *
 * That split is what survives build step 12 (TRD §11). When Supabase Auth
 * replaces the fixture directory, the facts arrive from a different place and
 * every rule below is unchanged — and still tested.
 *
 * Every state here is drawn from A10 of the design canvas, which enumerates
 * eight of them. Seven are decided here; the eighth (SIGNING IN) is a property
 * of the request being in flight, so it belongs to the component.
 */

/** Five wrong passwords in a row, then a quarter of an hour. A10 · 03, 04. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export type FieldName = "email" | "password";

/**
 * A fault names the field that caused it. The design is explicit that a
 * message is attached to its field and never raised as a banner across the
 * top of the form, so a fault that cannot name a field has nowhere to render.
 */
export interface FieldFault {
  readonly field: FieldName;
  readonly message: string;
}

export interface Account {
  readonly email: string;
  /** Null until they open the link we emailed. */
  readonly verifiedAt: number | null;
  /** When the last verification mail went out. Drives "four days ago". */
  readonly verificationSentAt: number | null;
}

/** What we have counted against one address. Reset by a successful sign-in. */
export interface Attempts {
  readonly wrong: number;
  readonly lockedUntil: number | null;
}

export const NO_ATTEMPTS: Attempts = { wrong: 0, lockedUntil: null };

export type SignInResult =
  /** A10 · 01, 02 — empty or malformed, caught before anything is looked up. */
  | { readonly kind: "fields"; readonly faults: readonly FieldFault[] }
  /** A10 · 04 */
  | { readonly kind: "locked"; readonly unlocksInMs: number }
  /** A10 · 05 */
  | {
      readonly kind: "unknown-email";
      readonly typed: string;
      readonly suggestion: string | null;
    }
  /**
   * A10 · 03.
   *
   * `triesLeft` is null when nobody is counting. Supabase Auth rate-limits on
   * its own terms and does not tell us how many guesses remain, and printing a
   * number we do not have is the same fault as printing a rate nobody entered
   * — it just reads as a threat instead of a cost. The screen says only that
   * the two do not match, which is all that is known.
   */
  | { readonly kind: "wrong-password"; readonly triesLeft: number | null }
  /** A10 · 06 */
  | {
      readonly kind: "unverified";
      readonly email: string;
      readonly sentDaysAgo: number | null;
    }
  | { readonly kind: "ok"; readonly email: string };

/** Everything the policy needs to know, gathered by whoever can gather it. */
export interface SignInFacts {
  /** Null when no account exists on the typed address. */
  readonly account: Account | null;
  /**
   * Whether the supplied password matched. Supplied as a fact rather than
   * computed here, so the comparison stays on the server and this stays pure.
   */
  readonly passwordMatches: boolean;
  /** Addresses we may offer as a near miss. */
  readonly directory: readonly string[];
  readonly attempts: Attempts;
  readonly now: number;
}

/* ── the fields ──────────────────────────────────────────────────────── */

/**
 * Deliberately not RFC 5322. A regular expression strict enough to reject a
 * real address is worse than one loose enough to pass a fake, because the
 * server finds the fake in a moment and only the human suffers the false
 * rejection. This catches the one mistake the design names: a missing ending.
 */
const SHAPED_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function emailFault(raw: string): FieldFault | null {
  const email = raw.trim();
  if (email === "") {
    return {
      field: "email",
      message: "We need your email to find your account.",
    };
  }
  if (!SHAPED_LIKE_EMAIL.test(email)) {
    return {
      field: "email",
      message: "That address is missing its ending — .in, .com or similar.",
    };
  }
  return null;
}

export function passwordFault(
  raw: string,
  submittedEmpty = true,
): FieldFault | null {
  if (raw !== "") return null;
  // "And your password." only reads correctly beneath the email's own message.
  return {
    field: "password",
    message: submittedEmpty ? "And your password." : "Your password.",
  };
}

/** A10 · 01 and 02 both live here: shape checks, in field order. */
export function fieldFaults(
  email: string,
  password: string,
): readonly FieldFault[] {
  const faults: FieldFault[] = [];
  const e = emailFault(email);
  if (e) faults.push(e);
  const p = passwordFault(password, e !== null);
  if (p) faults.push(p);
  return faults;
}

/* ── the near miss ───────────────────────────────────────────────────── */

function distance(a: string, b: string): number {
  // Row-at-a-time Levenshtein. The directory compared against is one
  // organisation's worth of addresses, so this is never hot.
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (prev[j] ?? 0) + 1;
      const insertion = (row[j - 1] ?? 0) + 1;
      row.push(Math.min(substitution, deletion, insertion));
    }
    prev = row;
  }
  return prev[b.length] ?? Math.max(a.length, b.length);
}

/**
 * The closest address we know, if it is close enough to be a typo rather than
 * a different person. The tolerance scales with length — three edits is a slip
 * in a long domain and a different account entirely in a short one.
 */
export function suggestEmail(
  typed: string,
  directory: readonly string[],
): string | null {
  const target = typed.trim().toLowerCase();
  if (target === "") return null;

  let best: string | null = null;
  let bestDistance = Infinity;
  for (const known of directory) {
    const d = distance(target, known.toLowerCase());
    if (d > 0 && d < bestDistance) {
      best = known;
      bestDistance = d;
    }
  }
  if (best === null) return null;

  const tolerance = Math.max(2, Math.floor(target.length * 0.15));
  return bestDistance <= tolerance ? best : null;
}

/* ── the decision ────────────────────────────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The order of these checks is the whole design.
 *
 * Lockout is read before the account, so a locked address says so whatever is
 * typed at it. Verification is read *after* the password, so a wrong guess
 * never learns whether the address is verified — and the "one step left" card
 * is only ever shown to someone who has proved the account is theirs.
 */
export function signIn(
  email: string,
  password: string,
  facts: SignInFacts,
): SignInResult {
  const faults = fieldFaults(email, password);
  if (faults.length > 0) return { kind: "fields", faults };

  const typed = email.trim();

  const { lockedUntil } = facts.attempts;
  if (lockedUntil !== null && lockedUntil > facts.now) {
    return { kind: "locked", unlocksInMs: lockedUntil - facts.now };
  }

  if (facts.account === null) {
    return {
      kind: "unknown-email",
      typed,
      suggestion: suggestEmail(typed, facts.directory),
    };
  }

  if (!facts.passwordMatches) {
    const wrong = facts.attempts.wrong + 1;
    if (wrong >= MAX_ATTEMPTS)
      return { kind: "locked", unlocksInMs: LOCKOUT_MS };
    return { kind: "wrong-password", triesLeft: MAX_ATTEMPTS - wrong };
  }

  if (facts.account.verifiedAt === null) {
    const sentAt = facts.account.verificationSentAt;
    return {
      kind: "unverified",
      email: facts.account.email,
      sentDaysAgo:
        sentAt === null ? null : Math.floor((facts.now - sentAt) / DAY_MS),
    };
  }

  return { kind: "ok", email: facts.account.email };
}

/**
 * The ledger after a decision. A right password clears the count outright —
 * four wrong guesses followed by the right one is a person remembering, not
 * an attack part-way through.
 */
export function nextAttempts(
  before: Attempts,
  result: SignInResult,
  now: number,
): Attempts {
  switch (result.kind) {
    case "wrong-password":
      return { wrong: before.wrong + 1, lockedUntil: before.lockedUntil };
    case "locked":
      return { wrong: MAX_ATTEMPTS, lockedUntil: now + result.unlocksInMs };
    case "ok":
    case "unverified":
      return NO_ATTEMPTS;
    // A shape error and an unknown address are not guesses at a password, and
    // counting them would let anyone lock an account they cannot spell.
    case "fields":
    case "unknown-email":
      return before;
  }
}

/* ── what the form is saying ─────────────────────────────────────────── */

/**
 * `idle` is the first render: nobody has submitted, so nothing is wrong yet.
 *
 * `unreachable` (A10 · 07) is never produced by `signIn` — it is what the
 * browser substitutes when the request does not come back at all, which is the
 * only honest way to tell a dropped connection from a refused password.
 */
export type SignInState =
  { readonly kind: "idle" } | { readonly kind: "unreachable" } | SignInResult;

export const IDLE: SignInState = { kind: "idle" };

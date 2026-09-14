/**
 * Proving an address is yours, with a code rather than a link.
 *
 * WHY A CODE. A confirmation link is single-use, and corporate mail systems
 * fetch links before the human does: Microsoft's Safe Links scans every URL in
 * every message, which spends the token and confirms the account, and the
 * person's own click then lands on "this link has expired". That is not a
 * theory — it is what happened to this product's first real confirmation mail,
 * and the evidence is an account marked confirmed at the same second the
 * scanner ran, with the owner staring at an error.
 *
 * A code cannot be spent by a scanner, because there is no URL to fetch. It
 * also works when the mail is read on a phone and the account is being set up
 * on a laptop, which is the other half of why people abandon this step.
 *
 * The link is not kept as a fallback. Both are derived from the same one-time
 * token, so a scanner that eats the link kills the code with it — offering
 * both would reintroduce exactly the failure this replaces.
 */

/** Supabase sends six digits as `{{ .Token }}`. */
export const CODE_LENGTH = 6;

/**
 * The digits out of whatever was pasted.
 *
 * People paste "123 456", "123-456", and the whole line of an email. Refusing
 * those teaches nothing and costs a retry; the digits are unambiguous, so they
 * are simply taken.
 */
export function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
}

/** What is wrong with a code, or null when it is ready to send. */
export function codeFault(raw: string): string | null {
  const digits = digitsOf(raw);
  if (digits === "") return "The code from the email goes here.";
  if (digits.length < CODE_LENGTH) {
    return `${String(CODE_LENGTH)} digits — that one is ${String(digits.length)}.`;
  }
  return null;
}

/**
 * What a refused code is told.
 *
 * One sentence for expired, mistyped and already-used alike. The person can do
 * exactly one thing about any of them, and naming which it was would be a
 * guess: the provider does not say, and inventing a diagnosis is worse than
 * admitting there is one thing to try.
 */
export const CODE_REFUSED =
  "That code has expired or does not match. Ask for another and it will arrive in a moment.";

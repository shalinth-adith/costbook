/**
 * The password rule, in one place.
 *
 * It lived in `components/entry-shell.tsx`, which is where it is read on
 * screen — but it is also the rule sign-up enforces on the server and the one
 * a reset has to enforce again, and a rule stated on a screen is not a rule.
 * The shell re-exports these so every existing import keeps working.
 *
 * Eight characters and nothing else, deliberately. A rule demanding a symbol
 * and a capital produces "Password1!" and a note beside the till; length is
 * the only requirement that buys anything.
 */
export const MIN_PASSWORD = 8;

export const PASSWORD_RULE =
  '8 characters or more. Nothing else — no symbol you’ll forget by Tuesday.';

/** What is wrong with a password, or null when nothing is. */
export function passwordFault(password: string): string | null {
  if (password.length === 0) return 'Choose a password.';
  if (password.length < MIN_PASSWORD) {
    return `${String(MIN_PASSWORD)} characters or more. Nothing else.`;
  }
  return null;
}

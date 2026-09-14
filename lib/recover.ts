import { passwordFault } from "./password";

/**
 * Getting back in, and proving an address is yours.
 *
 * Both flows are one shape: Costbook asks Supabase to post a link, the link
 * comes back to /auth/confirm carrying a one-time credential, and the handler
 * turns it into a session. The rules that decide what is accepted and where
 * somebody lands afterwards live here, away from the handler, because they
 * are the part worth testing and the handler is mostly plumbing.
 *
 * NOTHING HERE SAYS WHETHER AN ACCOUNT EXISTS. The reset screen answers the
 * same sentence to every address — that is the whole reason it is a constant
 * and not a branch. A screen that says "no account with that address" is a
 * screen that tells anybody which addresses have accounts, and this product
 * holds a café's supplier prices.
 */

/** How long Supabase's links live. Said on screen so nobody has to guess. */
export const LINK_MINUTES = 60;

/**
 * The reply to "send me a link", whatever the address.
 *
 * The reassurance is not padding: at this moment the fear is that asking has
 * locked you out of an account you can still get into.
 */
export const RESET_SENT =
  "If that address has an account, a link is on its way. It lasts an hour and can be used once. Your current password still works until you use it.";

/**
 * What a link can be for.
 *
 * Supabase will happily hand back other types; these are the ones this
 * product asks for, and anything else is refused rather than followed. An
 * unknown `type` on a URL is either a mistake or somebody exploring.
 */
export type ConfirmType =
  | "recovery"
  | "signup"
  | "email"
  | "email_change"
  | "invite";

const ACCEPTED: readonly ConfirmType[] = [
  "recovery",
  "signup",
  "email",
  "email_change",
  "invite",
];

export function confirmType(raw: string | null | undefined): ConfirmType | null {
  if (raw === null || raw === undefined) return null;
  const found = ACCEPTED.find((t) => t === raw.trim());
  return found ?? null;
}

/**
 * Where a verified link lands.
 *
 * A recovery link is the one that does not go home: it has signed somebody in
 * precisely so they can choose a password, and dropping them on the dashboard
 * would leave the account still holding the password they could not remember.
 * Everything else defers — `null` means "ask `afterSignIn`", which knows about
 * unfinished setup and about where the operator was going before the gate
 * stopped them.
 */
export function landingAfterConfirm(type: ConfirmType): string | null {
  return type === "recovery" ? "/reset/new" : null;
}

/**
 * What to say when a link does not work.
 *
 * One sentence for every cause — expired, already used, truncated by a mail
 * client — because the person reading it can do exactly one thing about any
 * of them, and that is ask for another. Naming which it was would be a guess
 * dressed as a diagnosis.
 */
export const LINK_FAILED =
  "That link has expired or has already been used. Ask for another and it will arrive in a moment.";

export { passwordFault };

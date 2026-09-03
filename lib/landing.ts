/**
 * Where someone goes after authenticating, decided in one place.
 *
 * It used to be decided in three that did not know about each other: sign-in
 * sent everyone to /dashboard, sign-up sent everyone to /setup, and the guard
 * bounced unfinished accounts back to /setup. Three rules, no single reader.
 */

import type { Role } from "./org";

/**
 * The route a role lands on.
 *
 * Manager goes to /dashboard today only because /kitchen does not exist yet.
 * A41 gives the chef their own landing — a short list of prices to confirm —
 * and when that screen is built this function is the only thing that changes.
 * Nothing else in the application decides a destination.
 */
export function landingFor(role: Role): string {
  if (role === "manager") return "/dashboard";
  return "/dashboard";
}

/**
 * Paths reachable without a session.
 *
 * /join and /reset were both on this list, and both are gone with the screens
 * they named. Neither did the thing it was on the list for.
 *
 * /reset never reset a password: it stepped between three local states and
 * finished with `router.push('/dashboard')`, which the proxy bounced straight
 * back to /sign-in. /join never read the token in its link and rendered the
 * lapsed state every time, so an invitation could only ever tell the person
 * following it that it had expired.
 *
 * A door painted on a wall is worse than no door — the person who needs it is
 * the one who can least afford to spend their afternoon on it. Both come back
 * when there is a domain, and a mail provider behind it, to send a real link.
 */
export const PUBLIC_PATHS: readonly string[] = [
  "/",
  "/sign-in",
  "/sign-up",
  "/privacy",
  "/terms",
  // Reached from the sign-in screen by someone who cannot get in. Gating the
  // page that tells them how to ask for help would be a closed loop.
  "/contact",
];

/** Whether a path is reachable with no session. */
export function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );
}

/** What the gate knows about whoever is asking. */
export interface Caller {
  readonly signedIn: boolean;
  /** Meaningless when signed out; the four questions belong to an account. */
  readonly setupDone: boolean;
  readonly role: Role;
}

/**
 * The rule table, as one function.
 *
 * Kept out of `proxy.ts` so it can be read on its own and tested without a
 * request, a session or a database. The proxy does the fetching and the
 * redirecting; this decides. Returns null to mean "let them through".
 *
 *   signed out              -> the public paths, else /sign-in?next=<path>
 *   signed in, setup open   -> /setup, and nothing else
 *   signed in, setup done   -> everything, and /setup sends them home
 */
export function gateFor(
  caller: Caller,
  path: string,
  search = "",
): string | null {
  /*
   * Route handlers answer for themselves. This looks like a hole and is not.
   *
   * A redirect is the wrong reply to a fetch, and wrong in a way that hides
   * itself: fetch follows a 307 by default, lands on /sign-in, gets a 200, and
   * hands the caller a page of sign-in markup as though it were the response.
   * Nothing anywhere reports an auth failure. It surfaces days later as "the
   * API returns garbage", and nobody reading that sentence goes looking at the
   * gate.
   *
   * So handlers are exempt here and check their own sessions. Some must:
   * /api/auth/dev-login is called with no session, because signing in is what
   * it is for, and it already refuses outside development.
   */
  if (path.startsWith("/api/")) return null;

  if (isPublic(path)) return null;

  if (!caller.signedIn) {
    return `/sign-in?next=${encodeURIComponent(`${path}${search}`)}`;
  }

  // The wizard is the only screen there is until it is answered, because every
  // other one would be showing figures nobody has set up.
  if (!caller.setupDone) return path === "/setup" ? null : "/setup";

  // And it is behind them once it is.
  return path === "/setup" ? landingFor(caller.role) : null;
}

/**
 * A `next` parameter, if it is safe to redirect to.
 *
 * The whole point of this function is that the value came from a query string,
 * which means it came from whoever wrote the link. A redirect is a browser
 * following an instruction carrying our own domain, so an attacker who can
 * choose the destination has a phishing page that arrives with our name on it.
 *
 * Returns null for anything that is not plainly a path inside this app, and
 * the caller falls back to the role's landing route.
 */
export function safeNext(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  /*
   * Browsers strip tab, newline and carriage return from a URL before parsing
   * it, so "/\tevil.com" is not the string it appears to be by the time it is
   * followed. Anything carrying a control character is refused rather than
   * cleaned, because cleaning invites an argument about what was left behind.
   */
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;

  const path = raw.trim();
  if (path === "" || !path.startsWith("/")) return null;

  // A leading double slash is protocol-relative: //evil.com is off-site, and
  // it is the one that looks like a path and is not.
  if (path.startsWith("//")) return null;

  // A backslash is normalised to a forward slash, so /\evil.com is //evil.com
  // by the time the browser follows it. Refused anywhere in the string.
  if (path.includes("\\")) return null;

  // Landing back on a pre-auth screen after authenticating is a loop, not a
  // destination. The caller falls back to the role's route.
  const bare = path.split("?")[0]?.split("#")[0] ?? path;
  if (isPublic(bare)) return null;

  return path;
}

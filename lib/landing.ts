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
 * /join and /reset are on this list deliberately: both are opened from an
 * email by someone who is not signed in, and gating them removes the only
 * path they have.
 */
export const PUBLIC_PATHS: readonly string[] = [
  "/",
  "/sign-in",
  "/sign-up",
  "/join",
  "/reset",
  "/privacy",
  "/terms",
];

/** Whether a path is reachable with no session. */
export function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)),
  );
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

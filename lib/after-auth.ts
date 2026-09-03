import { book } from "./book";
import { landingFor, safeNext } from "./landing";

/**
 * Where to send someone who has just authenticated.
 *
 * The one answer, asked by sign-in and by sign-up. Both used to decide for
 * themselves — sign-in sent everyone to /dashboard and sign-up to /setup —
 * and the guard held a third opinion, so the destination after signing in was
 * settled in three files that did not know about each other.
 *
 * The order matters. Setup comes before the intended destination, because an
 * account with four unanswered questions cannot usefully be dropped onto the
 * recipe they were trying to open: every figure on it would be reading off
 * settings nobody has given. The proxy would bounce them back to /setup
 * anyway; sending them there directly saves a redirect they would see.
 */
export async function afterSignIn(
  next: FormDataEntryValue | string | null,
): Promise<string> {
  const { org, role } = await book();

  if (!org.setupDone) return "/setup";

  const wanted = safeNext(typeof next === "string" ? next : null);
  if (wanted !== null) return wanted;

  /*
   * Their own role decides the route, and the book now knows which one is
   * theirs. It used to read `members[0]`, which is whichever membership row
   * Postgres returned first — with pending invitations concatenated onto the
   * same list. A manager signing in was routed as the owner about as often as
   * not, and it went unnoticed only because both roles land on /dashboard
   * today. A41 gives the chef their own screen, and on that day this would
   * have started sending the wrong people to it.
   *
   * A signed-in caller with no membership has nowhere of their own to land, so
   * they get the more restricted of the two rather than the more capable.
   */
  return landingFor(role ?? "manager");
}

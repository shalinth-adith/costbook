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
  const { org, members } = await book();

  if (!org.setupDone) return "/setup";

  const wanted = safeNext(typeof next === "string" ? next : null);
  if (wanted !== null) return wanted;

  // Their own membership decides the landing route. The book returns only the
  // organisation they belong to, so the first row is theirs.
  const role = members[0]?.role ?? "manager";
  return landingFor(role);
}

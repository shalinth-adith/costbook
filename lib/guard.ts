import { redirect } from "next/navigation";

import { book } from "./book";
import { type Role, canDo } from "./org";

/**
 * Send an account that has not finished setup to the wizard.
 *
 * This is not an authentication check and never was, though for a long time it
 * was the only thing on a page shaped like one. `proxy.ts` holds the gate; a
 * signed-out visitor never reaches this function. What it owns is the setup
 * question alone, and it stays because the proxy's redirect is optimistic —
 * this runs on the server, after the session is known, and is what actually
 * keeps an unfinished account out of a screen full of figures.
 *
 * A brand new book has no name, no currency answer, no tax answer and no
 * target. Landing on a dashboard reading "0 dishes · average food cost —"
 * teaches nothing and offers nothing; the four questions do both.
 *
 * It also keeps the header honest. The organisation is created with an empty
 * name rather than a guessed one, so the only way that blank is never seen is
 * to not show the app until step 1 is answered.
 */
export async function requireSetup(): Promise<void> {
  const { org } = await book();
  if (!org.setupDone) redirect("/setup");
}

/**
 * Refuse a server action the caller's role does not carry.
 *
 * Two comments in this codebase promised this function before it existed. The
 * RLS migration says owner-only actions are "checked here AND again in the
 * server action: never trust the client's idea of its own role", and `proxy.ts`
 * says its redirects are only the gate a person meets while "RLS in Postgres
 * plus the checks in every server action remain the guarantee". The database
 * half was written. This is the half that was not, and `canDo` sat unused in
 * `lib/org.ts` for want of it.
 *
 * It is not the security boundary — RLS is, and it holds whether this runs or
 * not. What it buys is the difference between a manager pressing Invite and
 * getting a refusal that names the reason, and a manager pressing Invite and
 * getting `WriteFailed: new row violates row-level security policy`, which
 * reads like a broken product rather than a closed door.
 *
 * Throws rather than redirects: a server action's caller is waiting on a
 * result, and a redirect mid-action is the reply nobody is reading for.
 */
export async function requireRole(
  what: Parameters<typeof canDo>[1],
): Promise<Role> {
  const { role } = await book();

  // Null is a session with no membership — removed mid-visit, or never
  // completed. Not a manager: a manager may do some things.
  if (role === null) {
    throw new Error("You are not on this book. Sign in again.");
  }
  if (!canDo(role, what)) {
    throw new Error(
      `Only the owner can change ${what}. Ask whoever set up the account.`,
    );
  }
  return role;
}

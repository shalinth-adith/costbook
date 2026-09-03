import { redirect } from "next/navigation";

import { book } from "./book";
import { FREE_LIMITS, type Role, atFreeLimit, canDo, canImport } from "./org";

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

/**
 * Whether there is room for another recipe on this plan.
 *
 * FLOWS 9 is explicit that the free tier is "enforced server-side on create,
 * never only in the UI", and TRD build step 25's acceptance check is that the
 * recipe past the limit "is blocked server-side". Neither was true: the cap
 * existed as a number, `atFreeLimit` was written to compare against it, and
 * nothing in the application ever called it. Settings drew a progress bar
 * against a limit that stopped nobody.
 *
 * Returns a refusal rather than throwing, because both callers answer with an
 * `Ack` that the screen renders — a thrown error there is the error boundary,
 * which is the wrong reply to "you have reached the free tier".
 *
 * What it deliberately does not do is touch anything that already exists.
 * Nothing is deleted at the limit and nothing is locked: FLOWS 9 says a
 * downgrade leaves recipes beyond the limit read-only, and every plan may
 * still edit what it has. This gates creation alone.
 */
export async function roomForRecipe(): Promise<
  { readonly ok: true } | { readonly ok: false; readonly message: string }
> {
  const { recipes, plan } = await book();
  if (!atFreeLimit(recipes.length, plan)) return { ok: true };
  return {
    ok: false,
    message:
      `The free tier holds ${FREE_LIMITS.recipes} recipes and you have them all. ` +
      `Everything you have stays costed and printable — what stops is adding ` +
      `another. The paid tier lifts it.`,
  };
}

/**
 * Whether this account may import a sheet at all.
 *
 * Import is a paid feature outright: the free tier is ten recipes entered by
 * hand, and a sheet is how a menu of eighty arrives. The alternatives were to
 * exempt import from the cap — which leaves a free account holding a costed
 * eighty-dish menu and makes the cap decorative — or to truncate an import at
 * ten, which ends the product's best moment in a partial menu and a dish list
 * cut off mid-alphabet. Neither is better than saying so before the upload.
 *
 * Checked on the server as well as on the screen, because the screen is a
 * courtesy. `commitImport` is the write, so that is where refusing matters.
 */
export async function importAllowed(): Promise<
  { readonly ok: true } | { readonly ok: false; readonly message: string }
> {
  const { plan } = await book();
  if (canImport(plan)) return { ok: true };
  return {
    ok: false,
    message:
      "Importing a sheet is part of the paid tier. The free tier costs " +
      `${FREE_LIMITS.recipes} recipes entered by hand, which is enough to see ` +
      "whether the arithmetic matches yours.",
  };
}

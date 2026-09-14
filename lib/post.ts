import type { Letter } from "./letters";
import { type Drained, drainWith } from "./mail";
import { SUPPORT_EMAIL } from "./org";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Posting a letter when nobody is signed in.
 *
 * The outbox is admin-only at the row level — a kitchen has no business
 * reading what we wrote to another kitchen — and the two callers here have no
 * session at all: a webhook from the payment provider, and a scheduled job.
 * So both go through the service key, and both go through this file, which is
 * the only place either of them touches mail.
 *
 * NOTHING HERE THROWS. A letter that cannot be written must never be the
 * reason a payment fails to settle: the money has moved, the plan has to go
 * on, and the worst outcome of a broken mailbox is that somebody is not
 * told — not that they paid for months they did not get. Every path returns a
 * boolean and says so in the log.
 */

/** Who to write to about an account, and what to call it. */
export async function ownerOf(
  orgId: string,
): Promise<{ readonly email: string; readonly orgName: string } | null> {
  try {
    const supabase = supabaseAdmin();

    const org = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    const orgName = (org.data as { name?: string } | null)?.name ?? "Your book";

    /*
     * The owner, not the first membership.
     *
     * A book can have a manager on it, and a letter about money belongs to
     * whoever pays. `auth.users` is not readable through the data API at all,
     * which is why this goes through the admin auth endpoint rather than a
     * join.
     */
    const member = await supabase
      .from("memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("role", "owner")
      .maybeSingle();
    const userId = (member.data as { user_id?: string } | null)?.user_id;
    if (userId === undefined) return null;

    const who = await supabase.auth.admin.getUserById(userId);
    const email = who.data.user?.email ?? "";
    if (!email.includes("@")) return null;

    return { email, orgName };
  } catch (error) {
    console.error("[mail] could not find who to write to:", String(error));
    return null;
  }
}

/** Write a row into the outbox. The drain posts it. */
async function write(to: string, letter: Letter): Promise<boolean> {
  try {
    const supabase = supabaseAdmin();
    const { error } = await supabase.from("mail_outbox").insert({
      to_email: to,
      subject: letter.subject.slice(0, 200),
      body: letter.body.slice(0, 8000),
    });
    if (error !== null) {
      console.error(`[mail] could not queue "${letter.subject}":`, error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[mail] could not queue "${letter.subject}":`, String(error));
    return false;
  }
}

/** To the person who pays for this book. */
export async function postToOwner(
  orgId: string,
  make: (orgName: string) => Letter,
): Promise<boolean> {
  const who = await ownerOf(orgId);
  if (who === null) {
    console.error(`[mail] no owner address for org ${orgId}`);
    return false;
  }
  return write(who.email, make(who.orgName));
}

/** To us, about something that needs a person. */
export async function postToSupport(letter: Letter): Promise<boolean> {
  return write(SUPPORT_EMAIL, letter);
}

/**
 * The nightly drain.
 *
 * Same loop as the console's, with the service key instead of a session —
 * because a scheduled job has no session, and the outbox is admin-only at the
 * row level. Without this the reminders would queue perfectly and sit there
 * until somebody happened to open the admin console.
 */
export async function drainAsService(limit = 50): Promise<Drained> {
  try {
    return await drainWith(supabaseAdmin(), limit);
  } catch (error) {
    console.error("[mail] the nightly drain could not run:", String(error));
    return { sent: 0, failed: 0, skipped: true };
  }
}

import { supabaseAdmin } from "./supabase/admin";

/**
 * Closing an account, for good.
 *
 * The privacy page has promised this since before there was any way to do it:
 * ask, and the account goes, backups included, with no copy kept to tempt
 * anyone back. Until now that was a sentence and an email address. This is
 * the sentence, done.
 *
 * IT NEEDS THE ADMIN KEY, AND NOT FOR CONVENIENCE. There is no delete policy
 * on `organizations` — row security grants an owner select and update, and
 * nothing else — so an owner genuinely cannot remove their own book through
 * their own session. Deleting the sign-in itself is further out of reach
 * still: `auth.users` is not a table the data API will touch at all.
 *
 * ORDER IS LOAD-BEARING, AND ONE STEP IS NOT OBVIOUS.
 *
 * Twelve tables cascade from `organizations`, so dropping that one row takes
 * the recipes, the rates, the history, the sales, the orders, the flags and
 * the support threads with it. Two do not cascade, and they are the whole
 * reason this function is longer than one statement:
 *
 *   `app_errors.org_id` is ON DELETE SET NULL, deliberately — a crash record
 *   must outlive the account, and the table is built to hold no payload: a
 *   message and a route, never a rate, a dish name or an address.
 *
 *   `mail_outbox.thread_id` is ALSO ON DELETE SET NULL — and that one is a
 *   leak. The row carries `to_email` and the full body of what was written.
 *   Cascade the threads away first and the outbox keeps a person's address
 *   and their support conversation, with nothing left pointing at them to say
 *   whose it was. So the outbox is cleared BEFORE the org, while the threads
 *   still exist to find it by. Reversing these two lines would leave exactly
 *   the copy the privacy page promises not to keep.
 */

export type Erasure =
  | { readonly ok: true; readonly signIns: number }
  | { readonly ok: false; readonly message: string };

export async function eraseOrg(orgId: string): Promise<Erasure> {
  const supabase = supabaseAdmin();

  /*
   * Who is on this book, read now — the memberships cascade away with the
   * org, so after that statement there is nothing left to say whose sign-ins
   * these were.
   */
  const members = await supabase
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId);
  if (members.error !== null) {
    return { ok: false, message: members.error.message };
  }
  const userIds = (members.data as { user_id: string }[] | null ?? []).map(
    (m) => m.user_id,
  );

  // The threads, for the same reason: in a moment there will be none.
  const threads = await supabase
    .from("support_threads")
    .select("id")
    .eq("org_id", orgId);
  if (threads.error !== null) {
    return { ok: false, message: threads.error.message };
  }
  const threadIds = (threads.data as { id: string }[] | null ?? []).map(
    (t) => t.id,
  );

  // The leak, closed first. See the note above — this cannot move below.
  if (threadIds.length > 0) {
    const outbox = await supabase
      .from("mail_outbox")
      .delete()
      .in("thread_id", threadIds);
    if (outbox.error !== null) {
      return { ok: false, message: outbox.error.message };
    }
  }

  // And the book itself, which takes the rest with it.
  const org = await supabase.from("organizations").delete().eq("id", orgId);
  if (org.error !== null) return { ok: false, message: org.error.message };

  /*
   * The sign-ins last, and only for somebody this was the last book of.
   *
   * Today an account has one owner and no invitations, so this is always all
   * of them. It is written as a check rather than an assumption because the
   * day that stops being true, deleting one kitchen would otherwise lock a
   * person out of another one — and that failure would arrive as somebody
   * unable to sign in with no idea why.
   *
   * A failure here is reported and not rolled back: the data is already gone,
   * which is the part that was promised, and re-creating the book to undo a
   * dangling sign-in would be worse than the dangling sign-in.
   */
  let removed = 0;
  for (const id of userIds) {
    const other = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", id)
      .limit(1);
    if (other.error !== null) continue;
    if ((other.data as unknown[] | null ?? []).length > 0) continue;

    const gone = await supabase.auth.admin.deleteUser(id);
    if (gone.error === null) removed += 1;
    else {
      console.error(
        `[erase] org ${orgId} is deleted and the sign-in for one of its ` +
          `members could not be removed: ${gone.error.message}`,
      );
    }
  }

  return { ok: true, signIns: removed };
}

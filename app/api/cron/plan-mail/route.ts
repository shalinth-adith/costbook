import { type Due, dueFor, endedLetter, endingLetter } from "@/lib/letters";
import { drainAsService, postToOwner } from "@/lib/post";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The one letter nobody clicks to send.
 *
 * Costbook sells a stretch of months and nothing renews, which is deliberate
 * (lib/plan.ts). The consequence is that a paying café will lapse in silence
 * unless something notices a date arriving — there is no failed charge to
 * report because there is no charge. This is that something: once a day, find
 * the stretches ending inside a week and the ones that have just ended, write
 * to each owner once, and post whatever is waiting.
 *
 * IT IS A ROUTE HANDLER BECAUSE THAT IS WHAT A SCHEDULER CAN CALL. Vercel's
 * cron is an HTTP GET with a shared secret in a header; there is no other
 * trigger in this deployment. See vercel.json for the schedule.
 *
 * EVERY LETTER IS STAMPED BEFORE IT IS QUEUED. The job runs daily and the
 * window is a week wide, so without a stamp a café would hear from us every
 * morning for seven days about the same date. The stamp is claimed with a
 * conditional update, so two overlapping runs cannot both win it.
 */

export const dynamic = "force-dynamic";

interface Row {
  readonly org_id: string;
  readonly plan: string;
  readonly current_period_end: string | null;
  readonly ending_notice_at: string | null;
  readonly ended_notice_at: string | null;
}

/** Vercel sends the secret as a bearer token. Nothing else may run this. */
function allowed(request: Request): boolean {
  const secret = process.env["CRON_SECRET"] ?? "";
  if (secret !== "") {
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }
  /*
   * No secret set. That is fine on a laptop, where running this by hand is
   * how it gets tested, and not fine anywhere else — an open endpoint that
   * writes mail is an open endpoint that sends mail.
   */
  return process.env.NODE_ENV !== "production";
}

export async function GET(request: Request): Promise<Response> {
  if (!allowed(request)) {
    return Response.json({ ran: false, why: "not authorised" }, { status: 401 });
  }

  const now = new Date();
  let supabase: ReturnType<typeof supabaseAdmin>;
  try {
    supabase = supabaseAdmin();
  } catch (error) {
    console.error("[plan-mail] no service key:", String(error));
    return Response.json({ ran: false, why: "no service key" }, { status: 500 });
  }

  /*
   * Only what could possibly be due.
   *
   * A paid stretch with an end date that has not already had both letters.
   * `dueFor` makes the actual decision — it is the tested part — and this
   * query exists only so the job does not read every account every night.
   */
  const found = await supabase
    .from("subscriptions")
    .select("org_id, plan, current_period_end, ending_notice_at, ended_notice_at")
    .eq("plan", "paid")
    .not("current_period_end", "is", null)
    .is("ended_notice_at", null)
    .limit(500);

  if (found.error !== null) {
    console.error("[plan-mail] could not read subscriptions:", found.error.message);
    return Response.json({ ran: false, why: "read failed" }, { status: 500 });
  }

  let ending = 0;
  let ended = 0;

  for (const row of (found.data ?? []) as Row[]) {
    const due: Due = dueFor(
      {
        plan: row.plan === "paid" ? "paid" : "free",
        periodEnd: row.current_period_end,
        endingNoticeAt: row.ending_notice_at,
        endedNoticeAt: row.ended_notice_at,
      },
      now,
    );
    if (due === null || row.current_period_end === null) continue;

    const until = row.current_period_end;
    const column = due === "ending" ? "ending_notice_at" : "ended_notice_at";

    // Claim first, write second: a letter queued and then not stamped would
    // be sent again tomorrow, which is the failure people actually notice.
    const claim = await supabase
      .from("subscriptions")
      .update({ [column]: now.toISOString() })
      .eq("org_id", row.org_id)
      .is(column, null)
      .select("org_id");
    if (claim.error !== null || (claim.data ?? []).length === 0) continue;

    const days = Math.max(
      1,
      Math.ceil((new Date(until).getTime() - now.getTime()) / 86_400_000),
    );

    const posted = await postToOwner(row.org_id, (orgName) =>
      due === "ending"
        ? endingLetter({ until, days, orgName })
        : endedLetter({ until, orgName }),
    );

    /*
     * Put the stamp back if there was nobody to write to.
     *
     * An account with no owner address is a real state — a membership row
     * that lost its user — and leaving the stamp would mean the letter is
     * never sent even after the address is fixed.
     */
    if (!posted) {
      await supabase
        .from("subscriptions")
        .update({ [column]: null })
        .eq("org_id", row.org_id);
      continue;
    }

    if (due === "ending") ending += 1;
    else ended += 1;
  }

  // Written and posted in one visit: a queue nobody drains is a queue.
  const drained = await drainAsService(50);

  console.log(
    `[plan-mail] ending ${String(ending)} · ended ${String(ended)} · ` +
      `posted ${String(drained.sent)} · refused ${String(drained.failed)}`,
  );

  return Response.json({
    ran: true,
    ending,
    ended,
    posted: drained.sent,
    refused: drained.failed,
  });
}

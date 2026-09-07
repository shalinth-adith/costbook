import type { Metadata } from "next";
import Link from "next/link";

import {
  accounts,
  importAttempts,
  paidOrders,
  recentErrors,
  threads,
  useRows,
} from "@/lib/admin";
import {
  costedButNeverMoved,
  dailyUse,
  funnelOf,
  importReach,
  renewingWithin,
  revenueOf,
  stuckBeforeImport,
  useOver,
} from "@/lib/metrics";
import { periodSaid } from "@/lib/engineering";

export const metadata: Metadata = { title: "Back office · Costbook" };
export const dynamic = "force-dynamic";

/**
 * The back office.
 *
 * Everything else in Costbook is one kitchen's own book. This is the only
 * screen that reads across all of them, and it exists for the person running
 * the product rather than the person running a restaurant.
 *
 * The funnel is FLOWS 10's, not one invented for a dashboard: the activation
 * moment is a rate change, not a signup, and the step to watch is import
 * completion. The lists under it are the two failures that document names —
 * set up and never imported, costed and never used — because a count nobody
 * can act on is a decoration.
 */
/**
 * A day, named the way somebody reading a fortnight would name it.
 *
 * "Today" and "Yesterday" rather than two dates, because those are the two
 * rows anybody actually looks at first, and a date makes the reader do the
 * arithmetic to find out which one they are on.
 */
function dayName(day: string, today: string): string {
  if (day === today) return "Today";
  const gap = Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${day}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (gap === 1) return "Yesterday";
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default async function AdminPage() {

  const today = new Date().toISOString().slice(0, 10);
  const [rows, orders, errors, support, tries, used] = await Promise.all([
    accounts(),
    paidOrders(),
    recentErrors(6),
    threads(),
    importAttempts(),
    useRows(30),
  ]);

  const funnel = funnelOf(rows);
  const sheets = importReach(rows);
  const money = revenueOf(orders, today);
  const fortnight = dailyUse(used, 14, today);
  const span = useOver(fortnight, used);
  const busiest = Math.max(1, ...fortnight.map((d) => d.visits));
  const renewing = renewingWithin(rows, today, 30);
  const stuck = stuckBeforeImport(rows);
  const idle = costedButNeverMoved(rows);
  const waiting = support.filter((t) => t.status === "open");
  const unseen = errors.filter((e) => !e.seen);
  const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="bo">
      <header className="ba-head">
        <h1 className="ba-h1">Costbook, whole</h1>
        <p className="ba-lede">How far kitchens get, what they pay, and who is worth a message.</p>
      </header>

      {/* The four figures that answer "how is it going" before any detail. */}
      <section className="bo-figs">
        <div className="bo-fig">
          <p className="figure">{rows.length}</p>
          <p>kitchens signed up</p>
        </div>
        <div className="bo-fig is-good">
          <p className="figure">{money.payers}</p>
          <p>have paid at least once</p>
        </div>
        <div className="bo-fig">
          <p className="figure">{rupees(money.thisMonth.total)}</p>
          <p>
            taken this month
            <span className="bo-fig-was">
              {rupees(money.lastMonth.total)} last month
            </span>
          </p>
        </div>
        <div className={`bo-fig${unseen.length > 0 ? " is-over" : ""}`}>
          <p className="figure">{unseen.length}</p>
          <p>faults nobody has looked at</p>
        </div>
      </section>

      <div className="bo-cols">
        {/* ── the funnel ─────────────────────────────────────────── */}
        <section className="bo-block">
          <h2 className="bo-h2">How far they get</h2>
          <p className="bo-lede">
            The steps in the order FLOWS puts them. Activation is a rate that
            moved — not a signup, because everything before it is setup.
          </p>
          <ol className="bo-funnel">
            {funnel.map((s) => (
              <li
                key={s.key}
                className={`bo-step${s.key === "activated" ? " is-watch" : ""}`}
              >
                <span className="bo-step-said">{s.said}</span>
                <span className="bo-step-bar" aria-hidden="true">
                  <span style={{ inlineSize: `${String(s.ofAll ?? 0)}%` }} />
                </span>
                <span className="figure bo-step-n">{s.count}</span>
                <span className="figure bo-step-share">
                  {s.ofAll === null ? "—" : `${String(Math.round(s.ofAll))}%`}
                </span>
                <span className="figure bo-step-lost">
                  {s.lost === 0 ? "" : `−${String(s.lost)}`}
                </span>
              </li>
            ))}
          </ol>
          {/*
            * Import beside the funnel, not inside it. On a book costed by
            * hand it drew "brought a sheet in: 0" above "changed a rate: 1"
            * — a later step larger than the one before it.
            */}
          <p className="bo-branch">
            <b className="figure">{sheets.count}</b> of them brought a sheet in
            {sheets.ofAll === null
              ? ""
              : ` — ${String(Math.round(sheets.ofAll))}%`}
            .
            <span>
              Not a step on the way: costing by hand is a whole path, and the
              free tier cannot import at all.
            </span>
          </p>

          {/*
            * The number FLOWS calls the one to watch, and the one the
            * database could not answer until the record was opened at the
            * mapping step rather than at commit.
            */}
          <dl className="bo-tries">
            <div>
              <dt>Sheets opened</dt>
              <dd className="figure">{tries.started}</dd>
            </div>
            <div>
              <dt>Committed</dt>
              <dd className="figure">{tries.committed}</dd>
            </div>
            <div className={tries.abandoned > 0 ? "is-over" : ""}>
              <dt>Abandoned</dt>
              <dd className="figure">{tries.abandoned}</dd>
            </div>
            {tries.inFlight > 0 && (
              <div>
                <dt>Open now</dt>
                <dd className="figure">{tries.inFlight}</dd>
              </div>
            )}
          </dl>
          <p className="bo-note">
            A sheet is counted from the moment its columns are on screen. One
            still open inside the hour is somebody reading their warnings, not
            an abandonment.
          </p>
        </section>

        {/* ── coming back ────────────────────────────────────────── */}
        <section className="bo-block">
          <h2 className="bo-h2">Signing in, and using it</h2>
          {/*
            * The only two things the product records about its own use: a
            * login, and a visit — one stretch of work, counted once every ten
            * minutes. Nothing here knows what anybody opened or cooked, and
            * the counting deliberately cannot be made to.
            */}
          <p className="bo-lede">
            The last fortnight. A visit is a stretch of work, counted once every
            ten minutes, so six visits is about an hour at the book.
          </p>

          <dl className="bo-use-figs">
            <div>
              <dt>Logins</dt>
              <dd className="figure">{span.logins}</dd>
            </div>
            <div>
              <dt>Visits</dt>
              <dd className="figure">{span.visits}</dd>
            </div>
            <div className={span.cameBack === 0 && span.kitchens > 0 ? "is-over" : ""}>
              <dt>Came back on another day</dt>
              <dd className="figure">{span.cameBack}</dd>
              <dd className="bo-use-of">of {span.kitchens} that appeared</dd>
            </div>
          </dl>

          {used.length === 0 ? (
            <p className="bo-note">
              Nothing recorded yet. Every sign-in and every stretch of work
              from here on lands in this table.
            </p>
          ) : (
            <table className="bo-use">
              <caption className="bo-use-cap">Newest first. A day nobody came is still a day.</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">In</th>
                  <th scope="col">Visits</th>
                  <th scope="col">Kitchens</th>
                  <th scope="col"><span className="bo-use-hide">How busy</span></th>
                </tr>
              </thead>
              <tbody>
                {[...fortnight].reverse().map((d) => (
                  <tr
                    key={d.day}
                    className={d.visits === 0 && d.logins === 0 ? "is-quiet" : ""}
                  >
                    <th scope="row">{dayName(d.day, today)}</th>
                    <td className="figure">{d.logins}</td>
                    <td className="figure">{d.visits}</td>
                    <td className="figure">{d.kitchens}</td>
                    <td>
                      <span className="bo-use-bar" aria-hidden="true">
                        <span
                          style={{ inlineSize: `${String((d.visits / busiest) * 100)}%` }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {span.quietDays > 0 && used.length > 0 && (
            <p className="bo-note">
              <b className="figure">{span.quietDays}</b> of the 14 days had
              nobody on them at all.
            </p>
          )}
        </section>
      </div>

      <div className="bo-cols">
        {/* ── money ──────────────────────────────────────────────── */}
        <section className="bo-block">
          <h2 className="bo-h2">Money taken</h2>
          <p className="bo-lede">
            Every order that was actually paid for, counted in whole rupees.
          </p>
          <dl className="bo-terms">
            <div>
              <dt>All time</dt>
              <dd className="figure">{rupees(money.all.total)}</dd>
              <dd className="bo-terms-n figure">{money.all.count} orders</dd>
            </div>
            {money.byTerm.map((t) => (
              <div key={t.term}>
                <dt>{t.term}</dt>
                <dd className="figure">{rupees(t.money.total)}</dd>
                <dd className="bo-terms-n figure">{t.money.count} orders</dd>
              </div>
            ))}
          </dl>
          {renewing.length > 0 && (
            <p className="bo-note">
              <b className="figure">{renewing.length}</b>{" "}
              {renewing.length === 1
                ? "subscription ends"
                : "subscriptions end"}{" "}
              in the next 30 days:{" "}
              {renewing
                .slice(0, 4)
                .map((r) => r.name)
                .join(", ")}
              {renewing.length > 4
                ? ` and ${String(renewing.length - 4)} more`
                : ""}
              .
            </p>
          )}
        </section>

        {/* ── who to write to ────────────────────────────────────── */}
        <section className="bo-block">
          <h2 className="bo-h2">Worth a message</h2>
          <p className="bo-lede">
            Two failures the product can name. Both are accounts that did the
            work and stopped short of the thing it is for.
          </p>

          <div className="bo-seg">
            <p className="bo-seg-h">
              <b className="figure">{stuck.length}</b> set up and never brought
              a sheet
            </p>
            <p className="bo-seg-who">
              {stuck.length === 0
                ? "Nobody, which is the answer you want."
                : stuck
                    .slice(0, 5)
                    .map((r) => r.name)
                    .join(", ") +
                  (stuck.length > 5
                    ? ` and ${String(stuck.length - 5)} more`
                    : "")}
            </p>
          </div>

          <div className="bo-seg">
            <p className="bo-seg-h">
              <b className="figure">{idle.length}</b> costed a book and never
              moved a rate
            </p>
            <p className="bo-seg-who">
              {idle.length === 0
                ? "Nobody."
                : idle
                    .slice(0, 5)
                    .map((r) => r.name)
                    .join(", ") +
                  (idle.length > 5
                    ? ` and ${String(idle.length - 5)} more`
                    : "")}
            </p>
          </div>

          <p className="bo-note">
            Reaching them needs the mail provider. Nothing here sends anything,
            and it will not pretend to.
          </p>
        </section>
      </div>
    </div>
  );
}

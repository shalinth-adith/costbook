"use client";

import Link from "next/link";

import type { DashboardRow, DashboardStats } from "@/lib/dashboard";
import type { FirstDish } from "@/lib/first-dish";
import type { Attributed, Recent } from "@/lib/recent";
import type { Spread } from "@/lib/spread";
import { DASH, percent, points } from "@/lib/format";
import { isTrustworthy, perHundred, standingOf } from "@/lib/plain";

import { DashboardEmpty } from "./dashboard-empty";
import { DashboardFirst } from "./dashboard-first";
import { useMoney } from "./currency-provider";

/**
 * Home — the kitchen, in sentences a cook can read.
 *
 * Twice rebuilt, and the second rebuild was still written by somebody who
 * already knew what the words meant. "Middle dish 16.6%" invented a term
 * nobody has heard. "56 cannot be placed yet" — placed on what? "Not weighted
 * by how much each dish sells" is a footnote to a statistician. The reader is
 * a cook, or the person who owns the shop, and neither of them opened this to
 * learn a vocabulary.
 *
 * A percentage is the engineer's unit. An owner thinks in money: what comes in
 * over the counter, and what of it goes straight back out to the supplier. So
 * every figure here is also a sentence, and the sentence is in money —
 * something anybody can check against their own till.
 */

/** A rise takes the over ink; a fall stays quiet. */
function Move({ percent: pc }: { percent: number | null }) {
  if (pc === null) return <span className="mv-new">first price</span>;
  const up = pc > 0;
  return (
    <span className={`figure mv-pc ${up ? "ink-over" : "ink-on"}`}>
      {up ? "+" : ""}
      {percent(pc)}
    </span>
  );
}

function Leader({ at }: { at: Attributed }) {
  const m = useMoney();
  const { move } = at;

  return (
    <div className="mv-row">
      <div className="mv-what">
        <span className="mv-name">{move.name}</span>
        <span className="mv-rates figure">
          {move.from === null ? DASH : m.money(move.from)}
          <span className="mv-arrow" aria-hidden="true">
            {" "}
            →{" "}
          </span>
          {m.money(move.to)}
        </span>
        <Move percent={move.percent} />
        {move.source === "import" && (
          <span className="mv-src">from a sheet</span>
        )}
      </div>

      <div className="mv-effect">
        {at.dishesMoved === 0 ? (
          <span className="mv-none">
            No dish uses it yet, so nothing changed.
          </span>
        ) : (
          <>
            {at.dishesMoved === 1
              ? "One dish"
              : `${String(at.dishesMoved)} dishes`}{" "}
            cost more because of this
            {at.crossed.length > 0 && (
              <>
                {", and "}
                {at.crossed.length === 1
                  ? "one of them"
                  : `${String(at.crossed.length)} of them`}{" "}
                <span className="ink-over">now costs more than you wanted</span>
              </>
            )}
            .
          </>
        )}
      </div>

      {at.crossed.length > 0 && (
        <ul className="mv-crossed">
          {at.crossed.map((c) => (
            <li key={c.id}>
              <Link href={`/recipes/${c.id}`} className="mv-dish">
                {c.name}
              </Link>
              <span className="figure mv-dish-fc ink-over">
                {c.newFoodCost === null ? DASH : percent(c.newFoodCost)}
              </span>
              {c.foodCostDelta !== null && (
                <span className="figure mv-dish-delta">
                  {points(c.foodCostDelta)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface StaleRate {
  readonly id: string;
  readonly name: string;
  readonly days: number;
}

export function DashboardView({
  orgName,
  moved,
  stats,
  spread,
  worst,
  stale,
  staleAfterDays,
  target,
  first,
  today,
}: {
  orgName: string;
  moved: Recent;
  stats: DashboardStats;
  spread: Spread;
  worst: readonly DashboardRow[];
  stale: readonly StaleRate[];
  staleAfterDays: number;
  target: number;
  first: FirstDish | null;
  today: string;
}) {
  const m = useMoney();

  if (first !== null) {
    return first.kind === "none" ? (
      <DashboardEmpty target={target} />
    ) : (
      <DashboardFirst state={first} target={target} today={today} />
    );
  }

  const blocked = stats.missingRate + stats.notPlated + stats.missingPrice;
  const spend = perHundred(spread.median);
  const want = perHundred(target) ?? 0;
  const standing = standingOf(spread.median, target);
  /*
   * Whether the headline may be stated flatly.
   *
   * The live book runs at 16.6% against a 30% target, which reads as a kitchen
   * doing wonderfully — and it is an artefact of 56 of its 79 dishes having no
   * rate. Printed large and unqualified it would congratulate an operator on a
   * margin that does not exist. Below two thirds costed it is still shown, and
   * still says what it was drawn from.
   */
  const solid = isTrustworthy(spread.placed, stats.costed);
  const sym = m.symbol;
  const ink =
    standing === "over" ? "over" : standing === "about" ? "near" : "on";

  return (
    <>
      {/* ── the headline ──────────────────────────────────────────── */}

      <section className="dh">
        <p className="dh-who">{orgName}</p>

        {spend === null ? (
          <p className="dh-said">
            Nothing is costed yet, so there is no figure to show you.
          </p>
        ) : (
          <>
            <div className="dh-row">
              <span className={`dh-figure figure ink-${ink}`}>
                {sym}
                {spend}
              </span>
              <p className="dh-said">
                of every <span className="figure">{sym}100</span> a guest pays
                you goes on ingredients.
              </p>
            </div>

            <p className="dh-against">
              You said you wanted to spend{" "}
              <span className="figure strong">
                {sym}
                {want}
              </span>
              , so you are{" "}
              {standing === "under" && (
                <span className="dh-verdict is-good">
                  spending less than you planned
                </span>
              )}
              {standing === "about" && (
                <span className="dh-verdict is-fine">
                  right about where you meant to be
                </span>
              )}
              {standing === "over" && (
                <span className="dh-verdict is-bad">
                  spending more than you planned
                </span>
              )}
              .
            </p>

            {!solid && (
              /* Said before anybody acts on the figure above it, never as a
                 footnote below the fold. */
              <p className="dh-caveat">
                <strong>Read that carefully.</strong> It only counts the{" "}
                <span className="figure">{spread.placed}</span> dishes that have
                both a selling price and rates for everything in them.{" "}
                <span className="figure">{spread.unplaced}</span> more are not
                finished, so the real figure will move once they are.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── the counts, each explaining itself ────────────────────── */}

      <div className="dc">
        <div className="dc-card">
          <span className="dc-n figure">{stats.costed}</span>
          <span className="dc-what">dishes in your book</span>
          <span className="dc-why">Everything you have written down.</span>
        </div>
        <div className="dc-card">
          <span className="dc-n figure">{spread.placed}</span>
          <span className="dc-what">are fully worked out</span>
          <span className="dc-why">
            These have a selling price and a rate for every ingredient in them.
          </span>
        </div>
        <div className={`dc-card${stats.over > 0 ? " is-bad" : ""}`}>
          <span className={`dc-n figure${stats.over > 0 ? " ink-over" : ""}`}>
            {stats.over}
          </span>
          <span className="dc-what">cost more than you wanted</span>
          <span className="dc-why">
            {stats.over === 0
              ? "Nothing is eating into your margin."
              : `Each uses more than ${sym}${String(want)} of every ${sym}100 you charge.`}
          </span>
        </div>
        <div className={`dc-card${blocked > 0 ? " is-open" : ""}`}>
          <span className="dc-n figure">{blocked}</span>
          <span className="dc-what">still need something from you</span>
          <span className="dc-why">
            A selling price, or what you pay for an ingredient.
          </span>
        </div>
      </div>

      {/* ── the spread ────────────────────────────────────────────── */}

      {spread.placed > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Where your dishes sit</h2>
          <p className="dash-lede">
            Each column counts the dishes that spend about the same. Further
            right means more of what a guest pays goes back out to the supplier.
            The black line is what you said you wanted.
          </p>
          <div className="card spr">
            <div className="spr-plot">
              {spread.bands.map((band, i) => (
                <div
                  key={band.from}
                  className={`spr-col ink-${band.status}${
                    i === spread.targetBand ? " is-target" : ""
                  }`}
                >
                  <span className="spr-count figure">
                    {band.count > 0 ? band.count : ""}
                  </span>
                  <span
                    className="spr-bar"
                    style={{
                      height: `${String(Math.max(band.height, band.count > 0 ? 4 : 0))}%`,
                    }}
                    title={
                      band.count === 0 ? "" : band.names.slice(0, 6).join(", ")
                    }
                  />
                  <span className="spr-tick figure">
                    {sym}
                    {band.from}
                    {band.to === null ? "+" : ""}
                  </span>
                </div>
              ))}
            </div>
            <p className="spr-axis">
              spent on ingredients, out of every {sym}100 charged
            </p>
          </div>
        </section>
      )}

      {/* ── the shortlist ─────────────────────────────────────────── */}

      {worst.length > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">The dishes taking the biggest bite</h2>
          <p className="dash-lede">
            Five worth a look. Open one to see where its cost is going.
          </p>
          <div className="card dash-worst">
            {worst.map((row, i) => (
              <Link key={row.id} href={`/recipes/${row.id}`} className="wr-row">
                <span className="wr-rank figure">{i + 1}</span>
                <span className="wr-name">{row.name}</span>
                <span className="wr-said">
                  costs{" "}
                  <span className="figure">
                    {row.costPerPortion === null
                      ? DASH
                      : m.withSymbol(row.costPerPortion)}
                  </span>
                  , sells at{" "}
                  <span className="figure">
                    {row.sellingPrice === null
                      ? DASH
                      : m.withSymbol(row.sellingPrice)}
                  </span>
                </span>
                <span className={`figure wr-fc ink-${row.status}`}>
                  {row.foodCostPercent === null
                    ? DASH
                    : `${sym}${String(perHundred(row.foodCostPercent) ?? 0)}`}
                </span>
                <span className="wr-bar" aria-hidden="true">
                  <span
                    className={`wr-bar-base ink-${row.status}`}
                    style={{
                      width: `${String(Math.min(((row.foodCostPercent ?? 0) / Math.max(target * 2, 1)) * 100, 100))}%`,
                    }}
                  />
                </span>
              </Link>
            ))}
          </div>
          <p className="dash-foot">
            The figure on the right is what each one spends out of every {sym}
            100 you charge for it.
          </p>
        </section>
      )}

      {/* ── what changed ──────────────────────────────────────────── */}

      <section className="dash-block">
        <h2 className="dash-h">What changed lately</h2>

        {moved.arrivals.length > 0 && (
          <p className="dash-lede">
            You gave <span className="figure">{moved.arrivals.length}</span>{" "}
            ingredients a price for the first time
            {moved.arrivals.some((a) => a.source === "import")
              ? ", mostly from a sheet"
              : ""}
            . That is your book filling up rather than anything getting dearer.
          </p>
        )}

        {moved.moves.length === 0 ? (
          <p className="dash-lede">
            No supplier price has changed in the last {moved.days} days, so
            nothing has quietly drifted. That is good news rather than an empty
            screen.
          </p>
        ) : (
          <>
            <p className="dash-lede">
              <span className="figure">{moved.moves.length}</span> supplier{" "}
              {moved.moves.length === 1 ? "price" : "prices"} changed in the
              last {moved.days} days.{" "}
              {moved.impact.moved.length > 0 && (
                <>
                  <span className="figure">{moved.impact.moved.length}</span>{" "}
                  {moved.impact.moved.length === 1 ? "dish" : "dishes"} cost
                  something different because of it.
                </>
              )}
            </p>
            <div className="card dash-moves">
              {moved.leaders.map((at) => (
                <Leader key={at.move.ingredientId} at={at} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── stale ─────────────────────────────────────────────────── */}

      {stale.length > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Prices you have not checked in a while</h2>
          <p className="dash-lede">
            Older than the {staleAfterDays} days you asked to be reminded at.
            Nothing is wrong with them — they are just the figures Costbook is
            trusting on your behalf.
          </p>
          <ul className="dash-stale">
            {stale.map((s) => (
              <li key={s.id} className="dash-stale-item">
                <Link href="/ingredients" className="dash-stale-name">
                  {s.name}
                </Link>
                <span className="figure dash-stale-days">{s.days} days</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── blocked ───────────────────────────────────────────────── */}

      {blocked > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Waiting on you</h2>
          <p className="dash-lede">
            None of these can be costed until something is filled in. A dish
            missing a rate shows the lowest it could possibly be, which is not
            what it really costs.
          </p>
          <div className="dash-blocked">
            {stats.missingRate > 0 && (
              <Link href="/ingredients" className="dash-blocked-item">
                <span className="figure dash-blocked-figure">
                  {stats.missingRate}
                </span>
                <span className="dash-blocked-said">
                  need what you pay for an ingredient
                </span>
              </Link>
            )}
            {stats.missingPrice > 0 && (
              <Link href="/recipes" className="dash-blocked-item">
                <span className="figure dash-blocked-figure">
                  {stats.missingPrice}
                </span>
                <span className="dash-blocked-said">need a selling price</span>
              </Link>
            )}
            {stats.notPlated > 0 && (
              <Link href="/recipes" className="dash-blocked-item">
                <span className="figure dash-blocked-figure">
                  {stats.notPlated}
                </span>
                <span className="dash-blocked-said">
                  are made by the batch, never served alone
                </span>
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );
}

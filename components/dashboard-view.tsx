"use client";

import Link from "next/link";

import type { DashboardRow, DashboardStats } from "@/lib/dashboard";
import type { Spread } from "@/lib/spread";
import type { FirstDish } from "@/lib/first-dish";
import type { Attributed, Recent } from "@/lib/recent";
import { DASH, percent, points } from "@/lib/format";

import { DashboardEmpty } from "./dashboard-empty";
import { DashboardFirst } from "./dashboard-first";
import { useMoney } from "./currency-provider";

/**
 * Home — what moved, and what it moved.
 *
 * This screen used to be a second recipe list. It showed every dish, worst
 * food cost first, with the same five columns Recipes already carried over the
 * same rows, linking to the same place. PRD 8 does describe it that way, but
 * FLOWS 1 describes what the owner actually does with it: "open the dashboard,
 * see which dishes drifted, change a rate or a price, close. Five minutes."
 *
 * A ranking of every dish is not drift. It is the same ranking this week as
 * last week unless something moved, and it never says what moved — the owner
 * had to work that out by rereading a list they had already read.
 *
 * So the table is gone, and the browsing it supported lives on Recipes, which
 * is better at it. What is here is only what was not here last time.
 */

/** Rise in the ink the product uses for a figure over target; fall in words. */
function Move({ percent: pc }: { percent: number | null }) {
  if (pc === null) return <span className="mv-new">first rate</span>;
  const up = pc > 0;
  return (
    <span className={`figure mv-pc ${up ? "ink-over" : "ink-on"}`}>
      {up ? "+" : ""}
      {percent(pc)}
    </span>
  );
}

function Leader({ at, target }: { at: Attributed; target: number }) {
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
        {/*
         * An import that moved 238 rates is one event, not 238. Saying which
         * it was stops the whole book looking hand-checked this morning —
         * the same reason the rate history records a source at all.
         */}
        {move.source === "import" && (
          <span className="mv-src">from a sheet</span>
        )}
      </div>

      <div className="mv-effect">
        {at.dishesMoved === 0 ? (
          <span className="mv-none">on no dish yet — nothing uses it</span>
        ) : (
          <>
            <span className="figure strong">{at.dishesMoved}</span>{" "}
            {at.dishesMoved === 1 ? "dish" : "dishes"} moved
            {at.crossed.length > 0 && (
              <>
                {", "}
                <span className="figure strong ink-over">
                  {at.crossed.length}
                </span>{" "}
                past {percent(target, 1)}
              </>
            )}
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
  moved: Recent;
  stats: DashboardStats;
  spread: Spread;
  /** Five, not seventy-nine. The book is on Recipes. */
  worst: readonly DashboardRow[];
  /** Rates past the account's own staleness threshold, oldest first. */
  stale: readonly StaleRate[];
  staleAfterDays: number;
  target: number;
  /** A42's state, or null once there is an ordinary book to report on. */
  first: FirstDish | null;
  today: string;
}) {
  /*
   * Nothing costed, or one thing. A change screen has nothing to say about a
   * book that has not happened yet, so A42 takes over until there is one.
   */
  if (first !== null) {
    return first.kind === "none" ? (
      <DashboardEmpty target={target} />
    ) : (
      <DashboardFirst state={first} target={target} today={today} />
    );
  }

  const blocked = stats.missingRate + stats.notPlated + stats.missingPrice;

  return (
    <>
      {/*
        * The answer first, in a sentence.
        *
        * The page opened with four equal tiles and no hierarchy — everything
        * the same size, so nothing was the point. An owner's question is one
        * sentence long and so is its answer.
        */}
      <div className="dash-hero">
        <p className="dash-hero-said">
          {stats.costed === 0 ? (
            <>Nothing is costed yet.</>
          ) : (
            <>
              The middle dish on your menu runs at{" "}
              <span className="figure dash-hero-figure">
                {spread.median === null ? DASH : percent(spread.median)}
              </span>
              {stats.over === 0 ? (
                <>
                  , and <span className="dash-hero-good">nothing is over</span>{" "}
                  your {percent(target, 1)} target.
                </>
              ) : (
                <>
                  , and{" "}
                  <span className="figure dash-hero-bad">{stats.over}</span>{" "}
                  {stats.over === 1 ? "dish is" : "dishes are"} over your{" "}
                  {percent(target, 1)} target.
                </>
              )}
            </>
          )}
        </p>
        <p className="dash-hero-sub">
          Costed from the rates you entered. Changes cover the last{" "}
          <span className="figure">{moved.days}</span> days. Every dish, grouped
          and searchable, is on{" "}
          <Link href="/recipes" className="link">
            Recipes
          </Link>
          .
        </p>
      </div>

      {/* ── where the menu stands ─────────────────────────────────── */}

      <div className="stats dash-top">
        <div className="stat">
          <span className="label">Dishes costed</span>
          <span className="figure stat-figure">{stats.costed}</span>
          <span className="stat-note">
            {spread.unplaced > 0
              ? `${spread.unplaced} cannot be placed yet`
              : 'every one of them placed'}
          </span>
        </div>
        <div className="stat">
          <span className="label">Middle dish</span>
          <span className="figure stat-figure">
            {spread.median === null ? DASH : percent(spread.median)}
          </span>
          {/*
            * The median, not the mean. A menu of eighty cheap tiffin items and
            * four expensive biryanis has a mean nobody's dish is near.
            */}
          <span className="stat-note">
            average {stats.averageFoodCost === null ? DASH : percent(stats.averageFoodCost)}
          </span>
        </div>
        <div className="stat">
          <span className="label">Over target</span>
          <span className={`figure stat-figure${stats.over > 0 ? ' ink-over' : ''}`}>
            {stats.over}
          </span>
          <span className="stat-note">against {percent(target, 1)}</span>
        </div>
        <div className="stat">
          <span className="label">Waiting on you</span>
          <span className="figure stat-figure">{blocked}</span>
          <span className="stat-note">
            {blocked === 0 ? 'nothing outstanding' : 'missing a rate or a price'}
          </span>
        </div>
      </div>

      {/* ── the spread ────────────────────────────────────────────── */}

      {spread.placed > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">How the menu sits</h2>
          <p className="dash-lede">
            Every costed dish by its food cost, five points a column. The line is
            your target of {percent(target, 1)}.{' '}
            {spread.unplaced > 0 && (
              <>
                <span className="figure">{spread.unplaced}</span> more cannot be
                placed until they have a rate and a price.
              </>
            )}
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
                  <span className="spr-count figure">{band.count > 0 ? band.count : ''}</span>
                  <span
                    className="spr-bar"
                    style={{ height: `${String(Math.max(band.height, band.count > 0 ? 4 : 0))}%` }}
                    title={
                      band.count === 0
                        ? 'nothing here'
                        : band.names.slice(0, 6).join(', ')
                    }
                  />
                  <span className="spr-tick figure">
                    {band.to === null ? `${String(band.from)}+` : band.from}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── the shortlist ─────────────────────────────────────────── */}

      {worst.length > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Costing you the most</h2>
          <p className="dash-lede">
            The {worst.length} highest food costs on the menu. The whole book,
            grouped and searchable, is on{' '}
            <Link href="/recipes" className="link">
              Recipes
            </Link>
            .
          </p>
          <div className="card dash-worst">
            {worst.map((row, i) => (
              <Link key={row.id} href={`/recipes/${row.id}`} className="wr-row">
                <span className="wr-rank figure">{i + 1}</span>
                <span className="wr-name">{row.name}</span>
                <span className="figure wr-cost">
                  {row.costPerPortion === null ? DASH : row.costPerPortion.toFixed(2)}
                </span>
                <span className="figure wr-price">
                  {row.sellingPrice === null ? DASH : row.sellingPrice.toFixed(2)}
                </span>
                <span className={`figure wr-fc ink-${row.status}`}>
                  {row.foodCostPercent === null ? DASH : percent(row.foodCostPercent)}
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
        </section>
      )}

      {/* ── what moved ────────────────────────────────────────────── */}

      <section className="dash-block">
        {/*
          * Rates that arrived, said once.
          *
          * An import that filled an empty book is 204 first rates on one day:
          * one event, not 204. Naming four of them alphabetically — which is
          * what a list sorted by a percentage none of them have does — teaches
          * nothing at all. They are also kept out of the impact entirely; see
          * `arrivals` in lib/recent.ts for why counting them as rises makes
          * the figure wrong rather than merely noisy.
          */}
        {moved.arrivals.length > 0 && (
          <div className="card card-note dash-arrived">
            <span>
              <span className="figure strong">{moved.arrivals.length}</span>{' '}
              {moved.arrivals.length === 1 ? 'ingredient' : 'ingredients'} got a
              rate for the first time
              {moved.arrivals.some((a) => a.source === 'import')
                ? ', most of them from a sheet'
                : ''}
              . That is a book filling up rather than prices rising, so none of
              it counts as movement below.
            </span>
          </div>
        )}

        {moved.quiet ? (
          <div className="card card-note dash-quiet">
            <span>
              No rate has changed in {moved.days} days, so nothing has drifted.
              That is a quiet month rather than an empty screen — every figure
              on{" "}
              <Link href="/recipes" className="link">
                Recipes
              </Link>{" "}
              still stands.
            </span>
          </div>
        ) : moved.moves.length === 0 ? null : (
          <>
            <h2 className="dash-h">Rates that changed</h2>
            <p className="dash-lede">
              {/*
               * The totals come from one pass over the whole window; the named
               * rows are the few biggest movers. Said plainly, because a list
               * that silently stops at four is a list that under-reports.
               */}
              <span className="figure strong">{moved.moves.length}</span>{" "}
              {moved.moves.length === 1 ? "rate" : "rates"} moved, and{" "}
              <span className="figure strong">{moved.impact.moved.length}</span>{" "}
              {moved.impact.moved.length === 1 ? "dish" : "dishes"} followed
              {moved.impact.crossCount > 0 ? (
                <>
                  {" "}
                  —{" "}
                  <span className="figure strong ink-over">
                    {moved.impact.crossCount}
                  </span>{" "}
                  of them past your target
                </>
              ) : (
                <>, none past your target</>
              )}
              .{" "}
              {moved.moves.length > moved.leaders.length && (
                <>The biggest {moved.leaders.length} are named here.</>
              )}
            </p>

            <div className="card dash-moves">
              {moved.leaders.map((at) => (
                <Leader key={at.move.ingredientId} at={at} target={target} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── rates going stale ─────────────────────────────────────── */}

      {stale.length > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Rates you have not checked</h2>
          <p className="dash-lede">
            Older than the {staleAfterDays} days you set. Nothing is wrong with
            them — they are simply the figures the book is now trusting on your
            behalf.
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
            These cannot be costed or priced until something is filled in. A
            dish missing a rate reports a floor, which is not a cost.
          </p>
          <div className="dash-blocked">
            {stats.missingRate > 0 && (
              <Link href="/ingredients" className="dash-blocked-item">
                <span className="figure dash-blocked-figure">
                  {stats.missingRate}
                </span>
                <span className="dash-blocked-said">missing a rate</span>
              </Link>
            )}
            {stats.missingPrice > 0 && (
              <Link href="/recipes" className="dash-blocked-item">
                <span className="figure dash-blocked-figure">
                  {stats.missingPrice}
                </span>
                <span className="dash-blocked-said">
                  costed, but not priced
                </span>
              </Link>
            )}
            {stats.notPlated > 0 && (
              <Link href="/recipes" className="dash-blocked-item">
                <span className="figure dash-blocked-figure">
                  {stats.notPlated}
                </span>
                <span className="dash-blocked-said">
                  made by the batch, never plated
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

    </>
  );
}

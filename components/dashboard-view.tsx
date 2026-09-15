"use client";

import Link from "next/link";
import { type CSSProperties, useState } from "react";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";
import type { DashboardStats } from "@/lib/dashboard";
import { GROUP_SAID, periodSaid, type Engineered } from "@/lib/engineering";
import type { FirstDish } from "@/lib/first-dish";
import type { MonthCompare } from "@/lib/month";
import { isTrustworthy, perHundred } from "@/lib/plain";
import type { Pile, Piles } from "@/lib/profit";
import type { Recent } from "@/lib/recent";
import type { Action, Todo as TodoList } from "@/lib/todo";
import type { Trend } from "@/lib/trend";

import { useMoney } from "./currency-provider";
import { DashboardEmpty } from "./dashboard-empty";
import { DashboardFirst } from "./dashboard-first";
import { Clock, CountUp } from "./dash-number";
import { Ring } from "./dash-ring";
import { Ledger, LedgerEmpty, LedgerRow, type Tone } from "./ledger";
import { MonthCard } from "./month-card";
import { SalesSheet } from "./sheets/sales-sheet";
import { TrendCard } from "./trend-card";

/**
 * Home. One figure, then three ledgers.
 *
 * REDRAWN. This was five headed sections in a column — do this today, what
 * changed lately, the ingredients that matter, the menu by what sells, the
 * prices not checked — each with a paragraph and a list, and nothing first.
 * The owner's question is "how is the menu doing, and what do I do today?"
 * So the page now answers it in that order:
 *
 *   the headline   the menu's food cost, as a ring and one sentence
 *   three ledgers  do today · moved lately · watch, side by side
 *   the piles      four counts, each a door to the list
 *   the month      what sold and what it left, when there are sales
 *
 * FOOD COST, NOT THE KEEP. The ring used to draw what the kitchen keeps of
 * every hundred. Food cost is what the target was set in, what a kitchen
 * says out loud, and what every trade figure is quoted in — so the headline
 * is the figure the owner already has in their head, compared with the one
 * they typed at setup.
 *
 * Every piece of motion is one of three things: arrival (in reading order,
 * once), the ring drawing to its share (once), the headline counting up
 * (once). Reduced motion turns all three off.
 */

const PILES: readonly {
  readonly key: Pile;
  readonly what: string;
  readonly tone: Tone;
}[] = [
  { key: "earning", what: "earning what you wanted", tone: "on" },
  { key: "thin", what: "earning less", tone: "near" },
  { key: "losing", what: "going out at a loss", tone: "over" },
  { key: "unpriced", what: "need a price from you", tone: "quiet" },
];

export interface StaleRate {
  readonly id: string;
  readonly name: string;
  readonly days: number;
}

/**
 * One thing to do, as a row.
 *
 * Each kind used to be a sentence — "Raise Koottu — 60 → 75 takes it from
 * keeping 52 to 61 of every 100." Every one of them is a name, a line, and
 * a figure, which is what a row holds; the sentence is what the dish's own
 * screen says when it is opened.
 */
function TodoRow({
  action,
  whole,
}: {
  action: Action;
  whole: (n: number) => string;
}) {
  const m = useMoney();
  const dishes = (n: number) => `${String(n)} ${n === 1 ? "dish" : "dishes"}`;
  switch (action.kind) {
    case "raise_price":
      return (
        <LedgerRow
          href={`/recipes/${action.row.id}`}
          tone={action.losing ? "over" : "near"}
          name={action.row.name}
          sub={
            <>
              {action.losing ? "sold at a loss · " : "raise · "}
              {m.withSymbol(action.from)} → <b>{m.withSymbol(action.to)}</b>
            </>
          }
          fig={
            <>
              keeps {whole(Math.round(action.keepsNow))} →{" "}
              {whole(Math.round(action.keepsAfter))}
            </>
          }
          figTone={action.losing ? "over" : undefined}
        />
      );
    case "confirm_yield":
      return (
        <LedgerRow
          href="/ingredients?show=assumed"
          tone="quiet"
          name={`Confirm trim on ${action.count === 1 ? "one ingredient" : `${String(action.count)} ingredients`}`}
          sub={`start with ${action.first.name} · in ${dishes(action.firstUsedIn)}`}
          fig={action.count}
        />
      );
    case "price_ingredients":
      return (
        <LedgerRow
          href="/ingredients"
          tone="quiet"
          name={`Price ${action.count === 1 ? "one ingredient" : `${String(action.count)} ingredients`}`}
          sub={
            action.probablyFree.length > 0
              ? `start with ${action.first.name} · ${action.probablyFree.join(", ")} probably free`
              : `start with ${action.first.name} · in ${dishes(action.firstUsedIn)}`
          }
          fig={action.count}
        />
      );
    case "check_rate":
      return (
        <LedgerRow
          href="/ingredients"
          tone="near"
          name={`Check the pack size on ${action.ingredient.name}`}
          sub={`${String(Math.round(action.times))}× every other rate · in ${dishes(action.usedIn)}`}
          fig={`${String(Math.round(action.times))}×`}
          figTone="near"
        />
      );
    case "check_portions":
      return (
        <LedgerRow
          href={`/recipes/${action.row.id}`}
          tone="near"
          name={`Check the portions on ${action.row.name}`}
          sub={`${m.withSymbol(action.costPerPortion)} a plate is ${String(Math.round(action.times))}× your typical dish`}
          fig={`${String(Math.round(action.times))}×`}
          figTone="near"
        />
      );
    case "rate_moved":
      return (
        <LedgerRow
          href="/ingredients"
          tone={action.percent > 0 ? "near" : "on"}
          name={`${action.name} ${action.percent > 0 ? "went up" : "came down"}`}
          sub={`this month · in ${dishes(action.usedIn)}`}
          fig={`${action.percent > 0 ? "+" : "−"}${String(Math.abs(Math.round(action.percent)))}%`}
          figTone={action.percent > 0 ? "near" : "on"}
        />
      );
    case "refresh_rate":
      return (
        <LedgerRow
          href="/ingredients"
          tone="quiet"
          name={`Check what you pay for ${action.ingredient.name}`}
          sub={`last confirmed ${String(action.days)} days ago · in ${dishes(action.usedIn)}`}
          fig={`${String(action.days)} d`}
        />
      );
  }
}

export function DashboardView({
  engineered,
  salesPeriod,
  recipes,
  onSaveSales,
  orgName,
  moved,
  month,
  trend,
  stats,
  piles,
  median,
  todo: list,
  topUsed,
  stale,
  staleAfterDays,
  target,
  first,
  today,
}: {
  orgName: string;
  moved: Recent;
  /** Last month against the one before it, from rate history rather than a snapshot. */
  month: MonthCompare;
  /** Six months of plate cost from the rate history. */
  trend: Trend;
  stats: DashboardStats;
  piles: Piles;
  median: number | null;
  /** What to do today, ranked, with the true total. */
  todo: TodoList;
  /** The ingredients reaching the most dishes — the negotiating list. */
  topUsed: readonly {
    readonly ingredient: Ingredient;
    readonly usedIn: number;
  }[];
  stale: readonly StaleRate[];
  staleAfterDays: number;
  target: number;
  first: FirstDish | null;
  today: string;
  /** Last month's menu, judged by what sold and what it left. Null until sales exist. */
  engineered: Engineered | null;
  salesPeriod: string;
  recipes: readonly Recipe[];
  onSaveSales: (
    period: string,
    text: string,
  ) => Promise<{
    readonly message: string;
    readonly undoable: boolean;
    readonly limit?: boolean;
  }>;
}) {
  /*
   * Which month the sales sheet is recording. Last month by default, because
   * that is the one a person is nearly always entering — but a kitchen
   * catching up after a quarter could previously record one month of three.
   */
  const [salesFor, setSalesFor] = useState(salesPeriod);

  const m = useMoney();
  const [salesOpen, setSalesOpen] = useState(false);
  /** The last save was refused by the plan, so the note carries the way to the plans. */
  const [salesLimit, setSalesLimit] = useState(false);
  const [salesBusy, setSalesBusy] = useState(false);
  const [salesNote, setSalesNote] = useState<string | null>(null);

  if (first !== null) {
    return first.kind === "none" ? (
      <DashboardEmpty target={target} used={recipes.length} />
    ) : (
      <DashboardFirst state={first} target={target} today={today} />
    );
  }

  const sym = m.symbol;
  /*
   * A whole figure in the currency, on the currency's own side of the number,
   * following the table in core/currency.ts — the Gulf codes sit before the
   * figure with a space, the way a price is written on a menu in Dubai.
   */
  const whole = (n: number): string =>
    m.position === "prefix" ? `${sym} ${String(n)}` : `${String(n)} ${sym}`;

  /*
   * The headline is the food cost: of every hundred a guest pays, what goes
   * on ingredients — the figure the target was set in.
   */
  const spend = perHundred(median);
  const want = perHundred(target) ?? 0;
  const total = piles.all.length;
  const answered = total - piles.unpriced.length;
  const solid = isTrustworthy(answered, total);
  const pulling = piles.thin.length + piles.losing.length;
  const heroInk: "on" | "near" | "over" =
    spend === null
      ? "near"
      : spend <= want
        ? "on"
        : spend <= want + 5
          ? "near"
          : "over";

  const at = (i: number) => ({ "--i": i }) as CSSProperties;

  return (
    <>
      {/* ── live ──────────────────────────────────────────────────── */}

      <div className="live">
        <span className="live-dot" aria-hidden="true" />
        <span className="live-word">Live</span>
        <span className="live-sep" aria-hidden="true">
          ·
        </span>
        <span className="live-who">{orgName}</span>
        <span className="live-spacer" />
        <Clock />
      </div>

      {/* ── the headline ──────────────────────────────────────────── */}

      <div className="hb-row">
        <section
          className="hb dsh-in"
          style={at(0)}
          aria-label="Your menu's food cost"
        >
          {spend !== null && (
            <div className="hb-ring">
              <Ring
                share={spend}
                target={want}
                ink={heroInk}
                size={120}
                stroke={10}
              />
              <span className={`hb-ring-figure figure ink-${heroInk}`}>
                <CountUp to={Math.round(spend)} duration={900} />
              </span>
            </div>
          )}
          <div className="hb-copy">
            <p className="hb-k">Your menu · food cost</p>
            {spend === null ? (
              <p className="hb-s">
                Nothing is costed yet, so there is no figure to show you.
              </p>
            ) : (
              <>
                <p className="hb-v display">
                  {whole(Math.round(spend))}{" "}
                  <span className="hb-of">of every {whole(100)}</span>
                </p>
                <p className="hb-s">
                  goes to ingredients. You asked for{" "}
                  <b className="figure">{whole(want)}</b>
                  {pulling > 0 ? (
                    <>
                      {" — "}
                      <Link href="/recipes?show=thin" className="hb-link">
                        <b className="figure">{pulling}</b>{" "}
                        {pulling === 1 ? "dish is" : "dishes are"} pulling it up
                      </Link>
                      .
                    </>
                  ) : (
                    <>, and every costed dish is inside it.</>
                  )}
                </p>
                {!solid && (
                  <p className="hb-caveat">
                    From <span className="figure">{answered}</span> costed{" "}
                    {answered === 1 ? "dish" : "dishes"} —{" "}
                    <span className="figure">{piles.unpriced.length}</span>{" "}
                    still {piles.unpriced.length === 1 ? "needs" : "need"} a
                    price.
                  </p>
                )}
              </>
            )}
          </div>
          {spend !== null && (
            <div className="hb-side">
              <span className="hb-k">Keeps</span>
              <span className="hb-side-v display">
                {whole(100 - Math.round(spend))}
              </span>
              <span className="hb-side-s">before rent, wages and gas</span>
            </div>
          )}
        </section>

        {/* Beside the figure only when there is a history to show; otherwise the
            band takes the row rather than leaving half of it empty. */}
        {trend.dishes > 0 && trend.months.length > 0 ? (
          <div className="dsh-in" style={at(1)}>
            <TrendCard trend={trend} />
          </div>
        ) : null}
      </div>

      {/* ── three ledgers ─────────────────────────────────────────── */}

      <div className="dsh-cols">
        <Ledger label="Do today" count={list.total} index={2}>
          {list.actions.length === 0 ? (
            <LedgerEmpty>
              Nothing needs you. Every costed dish is inside your target and no
              rate has gone stale.
            </LedgerEmpty>
          ) : (
            list.actions.map((a, i) => (
              <TodoRow
                key={`${a.kind}-${String(i)}`}
                action={a}
                whole={whole}
              />
            ))
          )}
          {list.total > list.actions.length && (
            <p className="lg-more">
              showing {list.actions.length} of {list.total}
            </p>
          )}
        </Ledger>

        <div className="dsh-col">
          <Ledger
            label={`Moved in ${String(moved.days)} days`}
            count={moved.moves.length}
            index={3}
          >
            {moved.moves.length === 0 ? (
              <LedgerEmpty>
                No supplier price moved.
                {moved.arrivals.length > 0 && (
                  <>
                    {" "}
                    <span className="figure">{moved.arrivals.length}</span>{" "}
                    rates given for the first time.
                  </>
                )}
              </LedgerEmpty>
            ) : (
              <>
                {moved.moves.slice(0, 4).map((mv) => (
                  <LedgerRow
                    key={mv.ingredientId}
                    href="/ingredients"
                    tone={
                      mv.percent === null
                        ? "quiet"
                        : mv.percent > 0
                          ? "near"
                          : "on"
                    }
                    name={mv.name}
                    sub={
                      mv.from === null
                        ? `first rate · ${m.withSymbol(mv.to)}`
                        : `${m.withSymbol(mv.from)} → ${m.withSymbol(mv.to)}`
                    }
                    fig={
                      mv.percent === null
                        ? "new"
                        : `${mv.percent > 0 ? "+" : "−"}${String(Math.abs(Math.round(mv.percent)))}%`
                    }
                    figTone={
                      mv.percent === null
                        ? "quiet"
                        : mv.percent > 0
                          ? "near"
                          : "on"
                    }
                  />
                ))}
                {moved.impact.moved.length > 0 && (
                  <p className="lg-more">
                    <span className="figure">{moved.impact.moved.length}</span>{" "}
                    {moved.impact.moved.length === 1
                      ? "dish costs"
                      : "dishes cost"}{" "}
                    something different
                  </p>
                )}
              </>
            )}
          </Ledger>
          <div className="dsh-in" style={at(5)}>
            <MonthCard month={month} />
          </div>
        </div>

        <aside className="dsh-rail dsh-in" style={at(4)} aria-label="Watch">
          <p className="lg-label">Watch</p>
          {stale.length > 0 ? (
            <div className="dsh-watch">
              <b className="dsh-watch-h">
                <span className="figure">{stale.length}</span>{" "}
                {stale.length === 1 ? "rate" : "rates"} unchecked{" "}
                {staleAfterDays}+ days
              </b>
              <span className="dsh-watch-s">
                {stale
                  .slice(0, 3)
                  .map((s) => s.name)
                  .join(", ")}
                {stale.length > 3
                  ? ` and ${String(stale.length - 3)} more`
                  : ""}
              </span>
              <Link href="/ingredients" className="btn dsh-watch-go">
                Check them
              </Link>
            </div>
          ) : (
            <p className="dsh-watch-s">
              Every rate was checked inside {staleAfterDays} days.
            </p>
          )}
          {stats.missingRate > 0 && (
            <Link href="/ingredients" className="dsh-watch">
              <b className="dsh-watch-h">
                <span className="figure">{stats.missingRate}</span>{" "}
                {stats.missingRate === 1
                  ? "ingredient has"
                  : "ingredients have"}{" "}
                no rate
              </b>
              <span className="dsh-watch-s">
                every dish above them reports a floor, not a cost
              </span>
            </Link>
          )}
          {topUsed.length > 0 && (
            <div className="dsh-watch">
              <span className="lg-label">Matter most</span>
              {topUsed.slice(0, 4).map((u) => (
                <span key={u.ingredient.id} className="dsh-top">
                  <span className="dsh-top-name">{u.ingredient.name}</span>
                  <span className="dsh-top-fig figure">
                    {u.usedIn} {u.usedIn === 1 ? "dish" : "dishes"}
                  </span>
                </span>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* ── the piles, each one a door ────────────────────────────── */}

      {/*
       * A count is a question — "which seven?" — and the answer is the list.
       * The Recipes screen is where somebody can act, so each count goes
       * there carrying which pile it meant.
       */}
      <div className="pile-strip">
        {PILES.map((p, i) => {
          const rows = piles[p.key];
          const share =
            total === 0 ? 0 : Math.round((rows.length / total) * 100);
          return (
            <Link
              key={p.key}
              href={rows.length === 0 ? "/recipes" : `/recipes?show=${p.key}`}
              className={`pile is-${p.tone} dsh-in`}
              style={at(6 + i)}
            >
              <span className="pile-v display">{rows.length}</span>
              <span className="pile-k">{p.what}</span>
              <span className="pile-s figure">
                {rows.length === 0 ? "none" : `${String(share)}% of the menu`}
              </span>
            </Link>
          );
        })}
      </div>

      {/* ── the month, by what sells ──────────────────────────────── */}

      <section className="dash-block dsh-in" style={at(10)}>
        <p className="lg-label">By what sells</p>
        {engineered === null ? (
          <>
            <p className="dash-lede">
              Paste {periodSaid(salesPeriod)}&rsquo;s sales and every dish lands
              in one of four groups: {GROUP_SAID.push.title.toLowerCase()},{" "}
              {GROUP_SAID.sells_leaves_little.title.toLowerCase()},{" "}
              {GROUP_SAID.leaves_sells_poorly.title.toLowerCase()}, and{" "}
              {GROUP_SAID.neither.title.toLowerCase()}.
            </p>
            {!salesOpen && (
              <button
                type="button"
                className="btn"
                onClick={() => setSalesOpen(true)}
              >
                Add {periodSaid(salesPeriod)}&rsquo;s sales
              </button>
            )}
          </>
        ) : (
          <>
            <p className="dash-lede">
              In {periodSaid(engineered.period)} the menu left{" "}
              <b className="figure">
                {m.withSymbol(Math.round(engineered.leftTotal))}
              </b>{" "}
              after plate costs, across {engineered.dishes.length} dishes with a
              figure.{" "}
              <button
                type="button"
                className="link"
                onClick={() => setSalesOpen(true)}
              >
                Paste another month
              </button>
            </p>
            <div className="me-grid">
              {(
                [
                  "push",
                  "sells_leaves_little",
                  "leaves_sells_poorly",
                  "neither",
                ] as const
              ).map((g) => (
                <div key={g} className={`me-group is-${g}`}>
                  <h3 className="me-h">{GROUP_SAID[g].title}</h3>
                  <p className="me-do">{GROUP_SAID[g].doThis}</p>
                  {engineered.groups[g].length === 0 ? (
                    <p className="me-none">None this month.</p>
                  ) : (
                    <ul className="me-list">
                      {engineered.groups[g].slice(0, 6).map((d) => (
                        <li key={d.id} className="me-row">
                          <Link href={`/recipes/${d.id}`} className="me-name">
                            {d.name}
                          </Link>
                          <span className="figure me-fig">
                            {d.sold} × {m.money(d.leaves)} ={" "}
                            <b>{m.withSymbol(Math.round(d.leftTotal))}</b>
                          </span>
                        </li>
                      ))}
                      {engineered.groups[g].length > 6 && (
                        <li className="me-more">
                          and {engineered.groups[g].length - 6} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* In place, under the button that opened it, where the numbers will show. */}
        {salesOpen && (
          <SalesSheet
            period={salesFor}
            periods={monthsBack(salesPeriod)}
            onPeriod={setSalesFor}
            onClose={() => setSalesOpen(false)}
            recipes={recipes}
            busy={salesBusy}
            onSave={(text) => {
              setSalesBusy(true);
              void onSaveSales(salesFor, text).then((ack) => {
                setSalesBusy(false);
                setSalesOpen(false);
                setSalesNote(ack.message);
                setSalesLimit(ack.limit === true);
              });
            }}
          />
        )}
        {salesNote !== null && (
          <p className="dash-lede me-note">
            {salesNote}
            {salesLimit ? (
              <>
                {" "}
                <Link className="link" href="/plans">
                  See the plans
                </Link>
                .
              </>
            ) : null}
          </p>
        )}
      </section>
    </>
  );
}

/** This month and the twelve behind it, newest first. */
function monthsBack(
  from: string,
): readonly { readonly id: string; readonly said: string }[] {
  const [y, mo] = from.split("-").map(Number);
  const out: { id: string; said: string }[] = [];
  const start = new Date(Date.UTC(y ?? 2026, (mo ?? 1) - 1, 1));
  for (let i = 0; i < 13; i += 1) {
    const d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i, 1),
    );
    // The first of the month, the shape `lastMonth` gives and the date column keys.
    const id = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
    out.push({ id, said: periodSaid(id) });
  }
  return out;
}

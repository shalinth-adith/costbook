"use client";

import type { Recipe } from '@/core/recipe';
import { GROUP_SAID, periodSaid, type Engineered } from '@/lib/engineering';
import { SalesSheet } from './sheets/sales-sheet';
import { MonthCard } from './month-card';
import { TrendCard } from './trend-card';
import Link from "next/link";
import { useState } from "react";

import type { DashboardRow, DashboardStats } from "@/lib/dashboard";
import type { FirstDish } from "@/lib/first-dish";
import type { Recent } from "@/lib/recent";
import type { MonthCompare } from "@/lib/month";
import type { Trend } from "@/lib/trend";
import { DASH } from "@/lib/format";
import { isTrustworthy, perHundred } from "@/lib/plain";
import {
  type Pile,
  type Piles,
  type Standing,
  missingSaid,
} from "@/lib/profit";
import type { Action, Todo as TodoList } from "@/lib/todo";
import type { Ingredient } from "@/core/ingredient";

import { DashboardEmpty } from "./dashboard-empty";
import { DashboardFirst } from "./dashboard-first";
import { Clock, CountUp } from "./dash-number";
import { Ring } from "./dash-ring";
import { useMoney } from "./currency-provider";
import { Sheet } from "./sheet";

/**
 * Home — live, in the way a till is live.
 *
 * A number on its own is a fact. A number that arrived — counted up, drew its
 * arc, slid into place a beat after the one beside it — is a fact somebody
 * just handed you, and that is the difference between a report and a
 * dashboard. The reference here is the class of product Sapaad belongs to:
 * KPI cards with a status each, a strip of live signals, the ones needing
 * attention breathing so the eye finds them.
 *
 * Every piece of motion on this page is one of four things, and nothing else:
 *   arrival     cards slide up in reading order, once
 *   drawing     the ring draws to its share, once
 *   growing     each card's bar grows to its width, once, after the card lands
 *   breathing   a signal that needs attention pulses, continuously, slowly
 *
 * Reduced-motion turns all four off. Somebody who asked for no motion asked
 * for no motion.
 */

const PILES: readonly {
  readonly key: Pile;
  readonly title: string;
  readonly what: string;
  readonly why: string;
  readonly ink: "on" | "near" | "over" | "quiet";
  readonly icon: React.ReactNode;
}[] = [
  {
    key: "earning",
    title: "Earning what you wanted",
    what: "earning well",
    why: "Keeping more of the price than you planned to.",
    ink: "on",
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 13l4.5-4.5 3 3L17 5" />
        <path d="M12 5h5v5" />
      </svg>
    ),
  },
  {
    key: "thin",
    title: "Earning less than you wanted",
    what: "earning thin",
    why: "Making money, but less than you asked for.",
    ink: "near",
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 7l4.5 4.5 3-3L17 15" />
        <path d="M12 15h5v-5" />
      </svg>
    ),
  },
  {
    key: "losing",
    title: "Costing more than they sell for",
    what: "losing money",
    why: "Every plate of these goes out at a loss.",
    ink: "over",
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7" />
        <path d="M10 6.5v4M10 13.5v.01" />
      </svg>
    ),
  },
  {
    key: "unpriced",
    title: "Cannot be worked out yet",
    what: "need a price from you",
    why: "A missing rate or selling price. Costbook will not guess.",
    ink: "quiet",
    icon: (
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M4 5h12M4 10h8M4 15h5" />
        <circle cx="15" cy="14" r="2.4" />
      </svg>
    ),
  },
];

function Row({
  standing,
  whole,
}: {
  standing: Standing;
  whole: (n: number) => string;
}) {
  const m = useMoney();
  const { row } = standing;
  return (
    <Link href={`/recipes/${row.id}`} className="pl-row">
      <span className="pl-name">{row.name}</span>
      {standing.keeps === null ? (
        <span className="pl-said">{missingSaid(row)}</span>
      ) : (
        <span className="pl-said">
          costs{" "}
          <span className="figure">
            {row.costPerPortion === null
              ? DASH
              : m.withSymbol(row.costPerPortion)}
          </span>
          , sells at{" "}
          <span className="figure">
            {row.sellingPrice === null ? DASH : m.withSymbol(row.sellingPrice)}
          </span>
        </span>
      )}
      <span className="pl-keeps figure">
        {standing.keeps === null
          ? DASH
          : whole(Math.round(standing.keeps))}
      </span>
    </Link>
  );
}

/**
 * One thing to do, as a sentence with its fix.
 *
 * Every kind names the dish or ingredient in bold, says the figure that makes
 * it a problem, and says what would fix it — because the owner reading this
 * is going to do one of them next, and "Koottu is thin" is not something you
 * can do.
 */
function Todo({
  action,
  whole,
}: {
  action: Action;
  whole: (n: number) => string;
}) {
  const m = useMoney();
  switch (action.kind) {
    case "raise_price":
      return (
        <Link href={`/recipes/${action.row.id}`} className={`td-row ${action.losing ? "ink-over" : "ink-near"}`}>
          <span className="td-mark" aria-hidden="true" />
          <span className="td-said">
            <b>{action.losing ? `${action.row.name} is sold at a loss` : `Raise ${action.row.name}`}</b>
            {" — "}
            {action.losing ? "it costs more to make than it sells for. " : ""}
            {m.withSymbol(action.from)} → <b className="figure">{m.withSymbol(action.to)}</b>
            {" takes it from keeping "}
            <span className="figure">{whole(Math.round(action.keepsNow))}</span>
            {" to "}
            <span className="figure">{whole(Math.round(action.keepsAfter))}</span>
            {" of every "}{whole(100)}.
          </span>
          <span className="td-go" aria-hidden="true">→</span>
        </Link>
      );
    case "confirm_yield":
      return (
        <Link href="/ingredients?show=assumed" className="td-row ink-quiet">
          <span className="td-mark" aria-hidden="true" />
          <span className="td-said">
            <b>
              Confirm what is left of{" "}
              {action.count === 1 ? "one ingredient" : `${String(action.count)} ingredients`}{" "}
              after trimming
            </b>
            {" — each is costed as though nothing is lost. Start with "}
            <b>{action.first.name}</b>
            {", it is in "}
            <span className="figure">{action.firstUsedIn}</span>
            {action.firstUsedIn === 1 ? " dish." : " dishes."}
          </span>
        </Link>
      );

    case "price_ingredients":
      return (
        <Link href="/ingredients" className="td-row ink-quiet">
          <span className="td-mark" aria-hidden="true" />
          <span className="td-said">
            <b>
              Give{" "}
              {action.count === 1 ? "one ingredient" : `${String(action.count)} ingredients`}{" "}
              a price
            </b>
            {" — start with "}
            <b>{action.first.name}</b>
            {", it is in "}
            <span className="figure">{action.firstUsedIn}</span>
            {action.firstUsedIn === 1 ? " dish." : " dishes."}
            {action.probablyFree.length > 0 && (
              <>
                {" "}
                {action.probablyFree.join(" and ")}{" "}
                {action.probablyFree.length === 1 ? "is" : "are"} probably free — set{" "}
                {action.probablyFree.length === 1 ? "it" : "them"} to 0.
              </>
            )}
          </span>
          <span className="td-go" aria-hidden="true">→</span>
        </Link>
      );
    case "check_rate":
      return (
        <Link href="/ingredients" className="td-row ink-near">
          <span className="td-mark" aria-hidden="true" />
          <span className="td-said">
            <b>Check the pack size on {action.ingredient.name}</b>
            {" — its rate is "}
            <span className="figure">{Math.round(action.times)}×</span>
            {" every other ingredient's, and it is in "}
            <span className="figure">{action.usedIn}</span>
            {action.usedIn === 1 ? " dish." : " dishes."}
            {" That is usually a price typed against the wrong unit."}
          </span>
          <span className="td-go" aria-hidden="true">→</span>
        </Link>
      );
    case "check_portions":
      return (
        <Link href={`/recipes/${action.row.id}`} className="td-row ink-near">
          <span className="td-mark" aria-hidden="true" />
          <span className="td-said">
            <b>Check the portion count on {action.row.name}</b>
            {" — "}
            <span className="figure">{m.withSymbol(action.costPerPortion)}</span>
            {" a plate is "}
            <span className="figure">{Math.round(action.times)}×</span>
            {" your typical dish. That is usually a whole batch costed as one serving."}
          </span>
          <span className="td-go" aria-hidden="true">→</span>
        </Link>
      );
    case "rate_moved":
      return (
        <Link href="/ingredients" className={`td-row ${action.percent > 0 ? "ink-near" : "ink-on"}`}>
          <span className="td-mark" aria-hidden="true" />
          <span className="td-said">
            <b>{action.name} {action.percent > 0 ? "went up" : "came down"}{" "}
              <span className="figure">{Math.abs(Math.round(action.percent))}%</span> this month</b>
            {" — it is in "}
            <span className="figure">{action.usedIn}</span>
            {action.usedIn === 1 ? " dish." : " dishes."}
            {action.percent > 0
              ? " Worth a look at what those charge now."
              : " Those dishes keep more than they did."}
          </span>
          <span className="td-go" aria-hidden="true">→</span>
        </Link>
      );
    case "refresh_rate":
      return (
        <Link href="/ingredients" className="td-row ink-quiet">
          <span className="td-mark" aria-hidden="true" />
          <span className="td-said">
            <b>Check what you pay for {action.ingredient.name}</b>
            {" — last confirmed "}
            <span className="figure">{action.days}</span>
            {" days ago, and it is in "}
            <span className="figure">{action.usedIn}</span>
            {action.usedIn === 1 ? " dish." : " dishes."}
          </span>
          <span className="td-go" aria-hidden="true">→</span>
        </Link>
      );
  }
}

export interface StaleRate {
  readonly id: string;
  readonly name: string;
  readonly days: number;
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
  topUsed: readonly { readonly ingredient: Ingredient; readonly usedIn: number }[];
  stale: readonly StaleRate[];
  staleAfterDays: number;
  target: number;
  first: FirstDish | null;
  today: string;
  /** Last month's menu, judged by what sold and what it left. Null until sales exist. */
  engineered: Engineered | null;
  salesPeriod: string;
  recipes: readonly Recipe[];
  onSaveSales: (period: string, text: string) => Promise<{ readonly message: string; readonly undoable: boolean; readonly limit?: boolean }>;
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
      <DashboardEmpty target={target} />
    ) : (
      <DashboardFirst state={first} target={target} today={today} />
    );
  }

  const sym = m.symbol;
  /*
   * A whole figure in the currency, on the currency's own side of the number.
   *
   * The hero used to build "AED83" by hand, symbol jammed against the figure,
   * while the rows below went through `withSymbol` and read "2.29 AED". Two
   * spellings of one currency on one screen. Everything here goes through
   * this now, and it follows the table in core/currency.ts — which is where
   * the Gulf codes were corrected to sit before the figure with a space, the
   * way a price is written on a menu in Dubai.
   */
  const whole = (n: number): string =>
    m.position === "prefix" ? `${sym} ${String(n)}` : `${String(n)} ${sym}`;
  const spend = perHundred(median);
  const keep = spend === null ? null : 100 - spend;
  const wantKeep = 100 - (perHundred(target) ?? 0);
  const total = piles.all.length;
  const answered = total - piles.unpriced.length;
  const solid = isTrustworthy(answered, total);
  const heroInk: "on" | "near" | "over" =
    keep === null
      ? "near"
      : keep >= wantKeep
        ? "on"
        : keep >= wantKeep - 5
          ? "near"
          : "over";

  /*
   * The signals strip. Each is one true thing that is either fine or needs
   * somebody, and the ones that need somebody breathe. This is the part of
   * the page that reads as a till rather than a report.
   */
  const signals: readonly {
    readonly key: string;
    readonly said: string;
    readonly ink: "on" | "near" | "over" | "quiet";
    readonly alert: boolean;
  }[] = [
    {
      key: "losing",
      said:
        piles.losing.length === 0
          ? "No dish is sold at a loss"
          : `${String(piles.losing.length)} sold at a loss`,
      ink: piles.losing.length === 0 ? "on" : "over",
      alert: piles.losing.length > 0,
    },
    {
      key: "thin",
      said:
        piles.thin.length === 0
          ? "Every costed dish hits your target"
          : `${String(piles.thin.length)} under your target`,
      ink: piles.thin.length === 0 ? "on" : "near",
      alert: piles.thin.length > 0,
    },
    {
      key: "unpriced",
      said: `${String(piles.unpriced.length)} waiting for a price`,
      ink: piles.unpriced.length === 0 ? "on" : "quiet",
      alert: false,
    },
    {
      key: "moved",
      said:
        moved.moves.length === 0
          ? `No supplier price moved in ${String(moved.days)} days`
          : `${String(moved.moves.length)} supplier prices moved`,
      ink: moved.moves.length === 0 ? "on" : "near",
      alert: moved.impact.crossCount > 0,
    },
    {
      key: "stale",
      said:
        stale.length === 0
          ? "Every price checked recently"
          : `${String(stale.length)} prices not checked in ${String(staleAfterDays)}+ days`,
      ink: stale.length === 0 ? "on" : "quiet",
      alert: false,
    },
  ];

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

      {/*
        * The figure and its history, side by side.
        *
        * The hero alone filled the left third of a wide screen and left the
        * rest empty; the six bars alone did the same two rows down. Beside
        * each other they are the first thing on the page: what you keep, and
        * what it has been costing. One column again below 1100px.
        */}
      <div className="dh-row">
      <section className="dh dh-ring">
        {keep !== null && (
          <div className="dh-ring-wrap">
            <Ring share={keep} target={wantKeep} ink={heroInk} />
            <span className={`dh-ring-figure figure ink-${heroInk}`}>
              <CountUp
                to={keep}
                prefix={m.position === "prefix" ? `${sym} ` : ""}
                suffix={m.position === "suffix" ? ` ${sym}` : ""}
                duration={900}
              />
            </span>
          </div>
        )}

        <div className="dh-copy">
          {keep === null || spend === null ? (
            <p className="dh-said">
              Nothing is costed yet, so there is no figure to show you.
            </p>
          ) : (
            <>
              {/*
                * One line, one mono line, one caveat. Three sentences used to
                * say what the figure and the fainter ring already show — a
                * dashboard is read at a glance, and a second telling of the
                * same fact is where the glance stops.
                */}
              <p className="dh-said">
                kept of every <span className="figure">{whole(100)}</span> a
                guest pays.
              </p>
              <p className="dh-line figure">
                Target <b>{whole(wantKeep)}</b>
                <span className="dh-sep" aria-hidden="true">·</span>
                <span className={`dh-verdict ${keep >= wantKeep ? "is-good" : "is-fine"}`}>
                  {keep >= wantKeep ? "ahead of it" : "a little behind it"}
                </span>
                <span className="dh-sep" aria-hidden="true">·</span>
                {whole(spend)} to suppliers
              </p>
              {!solid && (
                <p className="dh-caveat">
                  <i aria-hidden="true" />
                  From <span className="figure">{answered}</span> costed{" "}
                  {answered === 1 ? "dish" : "dishes"}.{" "}
                  <span className="figure">{piles.unpriced.length}</span> still{" "}
                  {piles.unpriced.length === 1 ? "needs" : "need"} a price.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── signals ───────────────────────────────────────────────── */}

      <TrendCard trend={trend} />
      </div>

      <ul className="sig" aria-label="Signals">
        {signals.map((s, i) => (
          <li
            key={s.key}
            className={`sig-item ink-${s.ink}${s.alert ? " is-alert" : ""}`}
            style={{ animationDelay: `${String(240 + i * 70)}ms` }}
          >
            <span className="sig-dot" aria-hidden="true" />
            {s.said}
          </li>
        ))}
      </ul>

      {/* ── do this today ─────────────────────────────────────────── */}

      {/* What to do, and beside it what has been happening. */}
      <div className="td-band">
      <section className="td">
        <div className="td-head">
          <h2 className="dash-h">Do this today</h2>
          {list.total > 0 && (
            <span className="td-count figure">{list.total}</span>
          )}
          {list.total > list.actions.length && (
            <span className="td-more">
              showing {list.actions.length} of {list.total}
            </span>
          )}
        </div>
        {list.actions.length === 0 ? (
          <p className="td-empty">
            Nothing needs you. Every costed dish is earning what you planned, nothing
            is waiting on a price, and no rate has gone stale. Go and cook.
          </p>
        ) : (
          <div className="td-list">
            {list.actions.map((a, i) => (
              <div key={`${a.kind}-${String(i)}`} className="td-item" style={{ animationDelay: `${String(300 + i * 70)}ms` }}>
                <Todo action={a} whole={whole} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/*
        What last month did, after what to do today and before the per-dish
        lists it explains. The page above answers "how am I doing now"; this
        answers "what happened", which is a different question and belongs
        after the actions rather than above them.
      */}


      <aside className="td-side" aria-label="What has been happening">
      <MonthCard month={month} />
      <section className="dash-block">
        <h2 className="dash-h">What changed lately</h2>
        {/* Two lines in the month block's shape: the fact, then a clause. */}
        {moved.arrivals.length > 0 && (
          <p className="mline">
            <b>
              <span className="figure">{moved.arrivals.length}</span> rates given for the first time
            </b>
            <span className="mline-said">
              {moved.arrivals.some((a) => a.source === "import") ? "mostly from a sheet" : "the book filling up"}
            </span>
          </p>
        )}
        {moved.moves.length === 0 ? (
          <p className="mline">
            <b>No supplier price moved in {moved.days} days</b>
            <span className="mline-said">nothing drifted</span>
          </p>
        ) : (
          <p className="mline">
            <b>
              <span className="figure">{moved.moves.length}</span> supplier{" "}
              {moved.moves.length === 1 ? "price" : "prices"} moved in {moved.days} days
            </b>
            <span className="mline-said">
              <span className="figure">{moved.impact.moved.length}</span>{" "}
              {moved.impact.moved.length === 1 ? "dish costs" : "dishes cost"} something different
            </span>
          </p>
        )}
      </section>

      </aside>
      </div>

      {/* ── best and weakest, by name ─────────────────────────────── */}

      {(piles.earning.length > 0 || piles.thin.length > 0 || piles.losing.length > 0) && (
        <div className="bw">
          <section className="bw-col">
            <h3 className="bw-h ink-on">Your best earners</h3>
            {piles.earning.slice(0, 3).map((s) => (
              <Link key={s.row.id} href={`/recipes/${s.row.id}`} className="bw-row">
                <span className="bw-name">{s.row.name}</span>
                <span className="bw-keeps figure ink-on">
                  keeps {whole(Math.round(s.keeps ?? 0))}
                </span>
              </Link>
            ))}
            {piles.earning.length === 0 && <p className="bw-none">None yet.</p>}
          </section>
          <section className="bw-col">
            <h3 className="bw-h ink-over">Earning you the least</h3>
            {[...piles.losing, ...piles.thin].slice(0, 3).map((s) => (
              <Link key={s.row.id} href={`/recipes/${s.row.id}`} className="bw-row">
                <span className="bw-name">{s.row.name}</span>
                <span className={`bw-keeps figure ${s.pile === "losing" ? "ink-over" : "ink-near"}`}>
                  {s.pile === "losing" ? "at a loss" : `keeps ${whole(Math.round(s.keeps ?? 0))}`}
                </span>
              </Link>
            ))}
            {piles.losing.length + piles.thin.length === 0 && (
              <p className="bw-none">Every costed dish hits your target.</p>
            )}
          </section>
        </div>
      )}

      {/* ── the counts, each one a door ───────────────────────────── */}

      <div className="dc">
        <div className="dc-card is-flat" style={{ animationDelay: "320ms" }}>
          <span className="dc-icon ink-quiet" aria-hidden="true">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h9l3 3v9H4z" />
              <path d="M7 9h6M7 12h6" />
            </svg>
          </span>
          <span className="dc-n figure">
            <CountUp to={total} duration={700} />
          </span>
          <span className="dc-what">recipes in your book</span>
          <span className="dc-why">Everything you have written down.</span>
          <span className="dc-bar" aria-hidden="true">
            <span
              className="dc-bar-fill ink-quiet"
              style={{ width: "100%", animationDelay: "780ms" }}
            />
          </span>
        </div>

        {/*
          * A count is a question, and the answer is the list.
          *
          * These opened a drawer that listed the same dishes again. The
          * Recipes screen is where somebody can actually act — search it,
          * sort it, open a dish and price it — so the count goes there
          * instead, carrying which pile it meant. A link also survives a
          * refresh, a bookmark and the Back button, which a drawer does not.
          */}
        {PILES.map((p, i) => {
          const list = piles[p.key];
          const share = total === 0 ? 0 : (list.length / total) * 100;
          return (
            <Link
              key={p.key}
              href={list.length === 0 ? '/recipes' : `/recipes?show=${p.key}`}
              className={`dc-card is-door ink-${p.ink}`}
              style={{ animationDelay: `${String(400 + i * 90)}ms` }}
            >
              <span className={`dc-icon ink-${p.ink}`} aria-hidden="true">
                {p.icon}
              </span>
              <span className={`dc-n figure ink-${p.ink}`}>
                <CountUp to={list.length} duration={700 + i * 80} />
              </span>
              <span className="dc-what">{p.what}</span>
              <span className="dc-bar" aria-hidden="true">
                <span
                  className={`dc-bar-fill ink-${p.ink}`}
                  style={{
                    width: `${String(share)}%`,
                    animationDelay: `${String(860 + i * 90)}ms`,
                  }}
                />
              </span>
              <span className="dc-share figure">
                {list.length === 0 ? "none" : `${String(Math.round(share))}% of the menu`}
              </span>
              {list.length > 0 && <span className="dc-go">see which ones</span>}
            </Link>
          );
        })}
      </div>

      {/* ── the ingredients that matter most ──────────────────────── */}


      {topUsed.length > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Ingredients that matter most</h2>
          <p className="dash-lede">
            The prices worth arguing over — by dishes reached.
          </p>
          <ul className="iu">
            {topUsed.map((u) => (
              <li key={u.ingredient.id} className={`iu-item${u.ingredient.purchasePrice === null ? " is-unpriced" : ""}`}>
                <span className="iu-name">{u.ingredient.name}</span>
                <span className="iu-count figure">{u.usedIn} {u.usedIn === 1 ? "dish" : "dishes"}</span>
                <span className="iu-rate figure">
                  {u.ingredient.purchasePrice === null
                    ? "no price yet"
                    : `${m.withSymbol(u.ingredient.purchasePrice)} / ${u.ingredient.purchaseUnit}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}


      {/* ── what changed ──────────────────────────────────────────── */}

      <section className="dash-block">
        <h2 className="dash-h">Your menu, by what sells</h2>
        {engineered === null ? (
          <>
            <p className="dash-lede">
              Paste {periodSaid(salesPeriod)}&rsquo;s sales and each dish lands in one of these.
            </p>
            {/*
              * The four groups, empty, before any sales exist.
              *
              * A button on its own answered "what happens if I paste?" with
              * nothing. The groups are what happens: every dish is sorted by
              * how often it sells against what a plate leaves, and each group
              * carries the one thing to do about it.
              */}
            <div className="me-grid is-empty" aria-label="What the sales will show">
              {(["push", "sells_leaves_little", "leaves_sells_poorly", "neither"] as const).map((g) => (
                <div key={g} className={`me-group is-${g}`}>
                  <h3 className="me-h">{GROUP_SAID[g].title}</h3>
                  <p className="me-do">{GROUP_SAID[g].doThis}</p>
                  <p className="me-none">Fills in from your sales.</p>
                </div>
              ))}
            </div>
            {!salesOpen && (
              <button type="button" className="btn" onClick={() => setSalesOpen(true)}>
                Add {periodSaid(salesPeriod)}&rsquo;s sales
              </button>
            )}
          </>
        ) : (
          <>
            <p className="dash-lede">
              In {periodSaid(engineered.period)} the menu left{" "}
              <b className="figure">{m.withSymbol(Math.round(engineered.leftTotal))}</b> after plate
              costs, across {engineered.dishes.length} dishes with a figure. The lines are the
              menu&rsquo;s own averages: {Math.round(engineered.meanSold)} sold and{" "}
              {m.withSymbol(engineered.meanLeaves)} left a plate.{" "}
              <button type="button" className="link" onClick={() => setSalesOpen(true)}>
                Paste another month
              </button>
            </p>
            <div className="me-grid">
              {(["push", "sells_leaves_little", "leaves_sells_poorly", "neither"] as const).map((g) => (
                <div key={g} className={`me-group is-${g}`}>
                  <h3 className="me-h">{GROUP_SAID[g].title}</h3>
                  <p className="me-do">{GROUP_SAID[g].doThis}</p>
                  {engineered.groups[g].length === 0 ? (
                    <p className="me-none">None this month.</p>
                  ) : (
                    <ul className="me-list">
                      {engineered.groups[g].slice(0, 6).map((d) => (
                        <li key={d.id} className="me-row">
                          <Link href={`/recipes/${d.id}`} className="me-name">{d.name}</Link>
                          <span className="figure me-fig">
                            {d.sold} × {m.money(d.leaves)} = <b>{m.withSymbol(Math.round(d.leftTotal))}</b>
                          </span>
                        </li>
                      ))}
                      {engineered.groups[g].length > 6 && (
                        <li className="me-more">and {engineered.groups[g].length - 6} more</li>
                      )}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/*
          * In place, not in a drawer.
          *
          * The sheet slid in from the right edge, a screen away from the
          * section that asked for it, with a paragraph explaining what to
          * paste. The panel opens under the button that opened it, where the
          * numbers will show, and the placeholder does the explaining.
          */}
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
                <Link className="link" href="/plans">See the plans</Link>.
              </>
            ) : null}
          </p>
        )}
      </section>

      {stale.length > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Prices you have not checked in a while</h2>
          <p className="dash-lede">
            Older than the {staleAfterDays} days you asked to be reminded at.
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
    </>
  );
}

/** This month and the twelve behind it, newest first. */
function monthsBack(from: string): readonly { readonly id: string; readonly said: string }[] {
  const [y, m] = from.split('-').map(Number);
  const out: { id: string; said: string }[] = [];
  const start = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, 1));
  for (let i = 0; i < 13; i += 1) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - i, 1));
    // The first of the month, the shape `lastMonth` gives and the date column keys.
    const id = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    out.push({ id, said: periodSaid(id) });
  }
  return out;
}

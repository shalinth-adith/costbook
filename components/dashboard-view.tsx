"use client";

import Link from "next/link";
import { useState } from "react";

import type { DashboardRow, DashboardStats } from "@/lib/dashboard";
import type { FirstDish } from "@/lib/first-dish";
import type { Recent } from "@/lib/recent";
import { DASH } from "@/lib/format";
import { isTrustworthy, perHundred } from "@/lib/plain";
import {
  type Pile,
  type Piles,
  type Standing,
  missingSaid,
} from "@/lib/profit";

import { DashboardEmpty } from "./dashboard-empty";
import { DashboardFirst } from "./dashboard-first";
import { Clock, CountUp } from "./dash-number";
import { useMoney } from "./currency-provider";
import { Sheet } from "./sheet";

/**
 * Home — the numbers, and the reason behind each one a press away.
 *
 * No chart. A distribution answers "how are my dishes spread", which is a
 * question an analyst asks; an owner asks "which ones are making me money and
 * which are not", and the answer to that is four counts and four lists.
 *
 * Every count opens a panel rather than a page. The reason a figure is what it
 * is belongs beside the figure — walking somebody to another screen to explain
 * a number they were already looking at loses them the number.
 *
 * Cost is said as margin throughout. The engine works in food cost because
 * that is what the arithmetic is, but an owner asks what they keep, and a dish
 * spending 34 of every 100 keeps 66. Same subtraction, other end, and the
 * second one is the sentence somebody nods at.
 */

/** The four piles, with the words the screen uses for each. */
const PILES: readonly {
  readonly key: Pile;
  readonly title: string;
  readonly what: string;
  readonly why: string;
  readonly ink: string;
}[] = [
  {
    key: "earning",
    title: "Earning what you wanted",
    what: "earning well",
    why: "These keep more of the price than you planned to keep.",
    ink: "on",
  },
  {
    key: "thin",
    title: "Earning less than you wanted",
    what: "earning thin",
    why: "Still making money, just less of it than you asked for.",
    ink: "near",
  },
  {
    key: "losing",
    title: "Costing more than they sell for",
    what: "losing money",
    why: "Every plate of these goes out at a loss.",
    ink: "over",
  },
  {
    key: "unpriced",
    title: "Cannot be worked out yet",
    what: "need a price from you",
    why: "A missing rate or selling price. Costbook will not guess one.",
    ink: "quiet",
  },
];

function Row({ standing, sym }: { standing: Standing; sym: string }) {
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
          : `${sym}${String(Math.round(standing.keeps))}`}
      </span>
    </Link>
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
  piles,
  median,
  stale,
  staleAfterDays,
  target,
  first,
  today,
}: {
  orgName: string;
  moved: Recent;
  stats: DashboardStats;
  piles: Piles;
  /** The middle dish's food cost, or null when nothing is costed. */
  median: number | null;
  stale: readonly StaleRate[];
  staleAfterDays: number;
  target: number;
  first: FirstDish | null;
  today: string;
}) {
  const m = useMoney();
  const [open, setOpen] = useState<Pile | null>(null);

  if (first !== null) {
    return first.kind === "none" ? (
      <DashboardEmpty target={target} />
    ) : (
      <DashboardFirst state={first} target={target} today={today} />
    );
  }

  const sym = m.symbol;
  const spend = perHundred(median);
  const keep = spend === null ? null : 100 - spend;
  const wantKeep = 100 - (perHundred(target) ?? 0);
  const answered = piles.all.length - piles.unpriced.length;
  const solid = isTrustworthy(answered, piles.all.length);
  const shown = PILES.find((p) => p.key === open);

  return (
    <>
      {/* ── the headline ──────────────────────────────────────────── */}

      <section className="dh">
        <div className="dh-top">
          <p className="dh-who">{orgName}</p>
          <Clock />
        </div>

        {keep === null ? (
          <p className="dh-said">
            Nothing is costed yet, so there is no figure to show you.
          </p>
        ) : (
          <>
            <div className="dh-row">
              <span
                className={`dh-figure figure ink-${keep >= wantKeep ? "on" : "near"}`}
              >
                <CountUp to={keep} prefix={sym} />
              </span>
              <p className="dh-said">
                is what you keep out of every{" "}
                <span className="figure">{sym}100</span> a guest pays you.
              </p>
            </div>

            <p className="dh-against">
              You planned to keep{" "}
              <span className="figure strong">
                {sym}
                {wantKeep}
              </span>
              , so you are{" "}
              <span
                className={`dh-verdict ${keep >= wantKeep ? "is-good" : "is-fine"}`}
              >
                {keep >= wantKeep
                  ? "ahead of your own target"
                  : "a little behind it"}
              </span>
              . The other{" "}
              <span className="figure">
                {sym}
                {spend}
              </span>{" "}
              goes to your suppliers.
            </p>

            {!solid && (
              <p className="dh-caveat">
                <strong>Read that carefully.</strong> It only counts the{" "}
                <span className="figure">{answered}</span> dishes that have both
                a selling price and rates for everything in them.{" "}
                <span className="figure">{piles.unpriced.length}</span> more
                cannot be worked out yet, so this will move once they are done.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── the counts, each one a door ───────────────────────────── */}

      <div className="dc">
        <button type="button" className="dc-card is-flat" disabled>
          <span className="dc-n figure">
            <CountUp to={piles.all.length} />
          </span>
          <span className="dc-what">recipes in your book</span>
          <span className="dc-why">Everything you have written down.</span>
        </button>

        {PILES.map((p, i) => {
          const list = piles[p.key];
          return (
            <button
              key={p.key}
              type="button"
              className={`dc-card is-door ink-${p.ink}`}
              style={{ animationDelay: `${String(60 + i * 55)}ms` }}
              onClick={() => {
                setOpen(p.key);
              }}
              aria-haspopup="dialog"
            >
              <span className={`dc-n figure ink-${p.ink}`}>
                <CountUp to={list.length} duration={520 + i * 60} />
              </span>
              <span className="dc-what">{p.what}</span>
              <span className="dc-why">{p.why}</span>
              <span className="dc-go">
                {list.length === 0 ? "nothing here" : "see which ones"}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── the reason, beside the figure rather than a page away ─── */}

      <Sheet
        title={shown?.title ?? ""}
        open={shown !== undefined}
        onClose={() => {
          setOpen(null);
        }}
      >
        {shown !== undefined && (
          <div className="pl">
            <p className="pl-lede">{shown.why}</p>
            {piles[shown.key].length === 0 ? (
              <p className="pl-empty">
                Nothing is in here, which is the answer you want.
              </p>
            ) : (
              <>
                <div className="pl-head">
                  <span>Dish</span>
                  <span />
                  <span className="pl-head-end">kept per {sym}100</span>
                </div>
                <div className="pl-rows">
                  {piles[shown.key].map((s) => (
                    <Row key={s.row.id} standing={s} sym={sym} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>

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
          <p className="dash-lede">
            <span className="figure">{moved.moves.length}</span> supplier{" "}
            {moved.moves.length === 1 ? "price" : "prices"} changed in the last{" "}
            {moved.days} days, and{" "}
            <span className="figure">{moved.impact.moved.length}</span>{" "}
            {moved.impact.moved.length === 1 ? "dish" : "dishes"} cost something
            different because of it.
          </p>
        )}
      </section>

      {/* ── stale ─────────────────────────────────────────────────── */}

      {stale.length > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Prices you have not checked in a while</h2>
          <p className="dash-lede">
            Older than the {staleAfterDays} days you asked to be reminded at.
            Nothing is wrong with them — they are the figures Costbook is
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
    </>
  );
}

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
  orgName,
  moved,
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
  const shown = PILES.find((p) => p.key === open);
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
              <p className="dh-said">
                That is what you keep out of every{" "}
                <span className="figure">{whole(100)}</span> a guest pays you.
              </p>
              <p className="dh-against">
                You planned to keep{" "}
                <span className="figure strong">{whole(wantKeep)}</span>{" "}
                — the fainter ring. So you are{" "}
                <span
                  className={`dh-verdict ${keep >= wantKeep ? "is-good" : "is-fine"}`}
                >
                  {keep >= wantKeep
                    ? "ahead of your own target"
                    : "a little behind it"}
                </span>
                . The other{" "}
                <span className="figure">{whole(spend)}</span>{" "}
                goes to your suppliers.
              </p>
              {!solid && (
                <p className="dh-caveat">
                  <strong>Read that carefully.</strong> It only counts the{" "}
                  <span className="figure">{answered}</span> dishes that have
                  both a selling price and rates for everything in them.{" "}
                  <span className="figure">{piles.unpriced.length}</span> more
                  cannot be worked out yet, so this will move once they are
                  done.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── signals ───────────────────────────────────────────────── */}

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

        {PILES.map((p, i) => {
          const list = piles[p.key];
          const share = total === 0 ? 0 : (list.length / total) * 100;
          return (
            <button
              key={p.key}
              type="button"
              className={`dc-card is-door ink-${p.ink}`}
              style={{ animationDelay: `${String(400 + i * 90)}ms` }}
              onClick={() => {
                setOpen(p.key);
              }}
              aria-haspopup="dialog"
            >
              <span className={`dc-icon ink-${p.ink}`} aria-hidden="true">
                {p.icon}
              </span>
              <span className={`dc-n figure ink-${p.ink}`}>
                <CountUp to={list.length} duration={700 + i * 80} />
              </span>
              <span className="dc-what">{p.what}</span>
              <span className="dc-why">{p.why}</span>
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
                {Math.round(share)}% of the menu
              </span>
              <span className="dc-go">
                {list.length === 0 ? "nothing here" : "see which ones"}
              </span>
            </button>
          );
        })}
      </div>

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
                  <span className="pl-head-end">kept per {whole(100)}</span>
                </div>
                <div className="pl-rows">
                  {piles[shown.key].map((s) => (
                    <Row key={s.row.id} standing={s} whole={whole} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </Sheet>

      {/* ── the ingredients that matter most ──────────────────────── */}

      {topUsed.length > 0 && (
        <section className="dash-block">
          <h2 className="dash-h">Ingredients that matter most</h2>
          <p className="dash-lede">
            By how many dishes each one reaches, counting through your batches. These are
            the prices worth arguing over with a supplier, and the ones to keep current.
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

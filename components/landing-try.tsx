"use client";

import { useId, useState } from "react";

/**
 * Move a price, watch the plate.
 *
 * The one thing on the entry screen a visitor does rather than watches. The
 * ripple above it plays the product's claim for them; this puts the claim in
 * their hand: drag one ingredient's rate and a dish reprices under their
 * thumb — the food-cost ring fills, the badge flips as it crosses the
 * target, and the price that would hold the margin moves with it.
 *
 * The arithmetic is real. One bowl of onion soup carries a quarter kilo of
 * onion, the rest of its cost is fixed, and the share is cost over the menu
 * price. That is the whole of what the product does, at the size of a toy.
 *
 * Onion soup, not a dish from the graph above: a visitor who compared the
 * two would find different figures for the same plate and trust neither.
 * This one is the dish where onion matters most, which is the point.
 *
 * A native range input under the styling: the keyboard, the screen reader
 * and a thumb on a phone all already know how to work one.
 */

/** The dish, as its own book would hold it. */
const DISH = {
  name: "French onion soup",
  sellsAt: 180,
  /** Everything on the plate that is not onion: stock, gruyère, bread, butter. */
  fixed: 44,
  /** A quarter kilo of onion a bowl, once it has cooked down. */
  onionKg: 0.25,
};
const TARGET = 32;
const TODAY = 42;
const RANGE = { min: 20, max: 90 };

/** Food cost as a share of the menu price, at this onion rate. */
function shareAt(rate: number): number {
  return ((DISH.fixed + DISH.onionKg * rate) / DISH.sellsAt) * 100;
}

/** What the plate would have to sell at to hold the target. */
function priceToHold(rate: number): number {
  return (DISH.fixed + DISH.onionKg * rate) / (TARGET / 100);
}

/* The ring: a 270° arc, 0–50% of the price, target mark at 32. */
const R = 44;
const SWEEP = 270;
const SCALE_MAX = 50;
const ARC = (Math.PI * R * 2 * SWEEP) / 360;

function arcLength(pct: number): number {
  return (Math.min(pct, SCALE_MAX) / SCALE_MAX) * ARC;
}
function markAngle(pct: number): number {
  return -135 + (pct / SCALE_MAX) * SWEEP;
}

export function LandingTry() {
  const [rate, setRate] = useState(TODAY);
  const id = useId();

  const share = shareAt(rate);
  const over = share > TARGET;
  const hold = priceToHold(rate);
  const wasShare = shareAt(TODAY);

  return (
    <section className="lp-try" aria-labelledby={`${id}-h`}>
      <div className="lp-try-say">
        <p className="lp-eyebrow">Try it</p>
        <h2 className="lp-try-h" id={`${id}-h`}>
          Move a price. <span>Watch the plate.</span>
        </h2>
        <p className="lp-try-note">
          One bowl carries a quarter kilo of onion. Drag the rate and see what
          it does to the share — and what you would have to charge to hold your
          line.
        </p>
      </div>

      {/* ── the rate ─────────────────────────────────────────────── */}
      <div className="lp-try-rate">
        <div className="lp-try-rate-head">
          <label htmlFor={`${id}-rate`} className="lp-try-rate-name">
            Onion, large
          </label>
          <span className="figure lp-try-rate-fig" aria-hidden="true">
            {rate.toFixed(2)}
            <span className="lp-try-rate-unit">/kg</span>
          </span>
        </div>

        <div
          className="lp-try-slider"
          style={
            {
              "--lp-try-pos": `${String(((rate - RANGE.min) / (RANGE.max - RANGE.min)) * 100)}%`,
              "--lp-try-today": `${String(((TODAY - RANGE.min) / (RANGE.max - RANGE.min)) * 100)}%`,
            } as React.CSSProperties
          }
        >
          <input
            id={`${id}-rate`}
            type="range"
            min={RANGE.min}
            max={RANGE.max}
            step={1}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            aria-valuetext={`${rate.toFixed(2)} a kilo`}
            className="lp-try-input"
          />
          <span className="lp-try-today" aria-hidden="true">
            <span className="figure">today · {TODAY}</span>
          </span>
        </div>

        <div className="lp-try-presets" role="group" aria-label="Set the rate">
          <button
            type="button"
            className="lp-try-chip"
            onClick={() => setRate(TODAY)}
          >
            Back to today
          </button>
          <button
            type="button"
            className="lp-try-chip"
            onClick={() => setRate(60)}
          >
            Supplier says <b className="figure">60</b>
          </button>
          <button
            type="button"
            className="lp-try-chip"
            onClick={() => setRate(80)}
          >
            A bad month, <b className="figure">80</b>
          </button>
        </div>
      </div>

      {/* ── the plate ────────────────────────────────────────────── */}
      <div className={`lp-try-plate${over ? " is-over" : ""}`}>
        <div className="lp-try-ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle
              className="lp-try-ring-track"
              cx="60"
              cy="60"
              r={R}
              pathLength={ARC}
              strokeDasharray={`${String(ARC)} ${String(ARC * 2)}`}
              transform="rotate(135 60 60)"
            />
            <circle
              className="lp-try-ring-fill"
              cx="60"
              cy="60"
              r={R}
              pathLength={ARC}
              strokeDasharray={`${String(arcLength(share))} ${String(ARC * 2)}`}
              transform="rotate(135 60 60)"
            />
            {/* The line you set. Everything is measured against it. */}
            <line
              className="lp-try-ring-target"
              x1="60"
              y1="9"
              x2="60"
              y2="19"
              transform={`rotate(${String(markAngle(TARGET))} 60 60)`}
            />
          </svg>
          <div className="lp-try-ring-in">
            <span
              className="figure lp-try-share"
              aria-live="polite"
              aria-atomic="true"
            >
              {share.toFixed(1)}%
            </span>
            <span className="lp-try-share-said">food cost</span>
          </div>
        </div>

        <div className="lp-try-plate-say">
          <p className="lp-try-dish">
            {DISH.name}
            <span className="figure">sells at {DISH.sellsAt}</span>
          </p>
          <p className="lp-try-badge-row">
            <span
              className={`figure lp-try-badge ${over ? "is-over" : "is-under"}`}
            >
              {over ? "Over" : "Under"} your {TARGET}%
            </span>
            <span className="figure lp-try-delta">
              {share === wasShare
                ? "as today"
                : `${share > wasShare ? "+" : "−"}${Math.abs(share - wasShare).toFixed(1)} pts`}
            </span>
          </p>
          <p className="lp-try-hold">
            To hold {TARGET}%, charge{" "}
            <b className="figure">{Math.ceil(hold)}</b>
            {hold > DISH.sellsAt ? (
              <span className="figure lp-try-hold-up">
                +{Math.ceil(hold - DISH.sellsAt)}
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';

import { PRESETS, type PresetName, applyRounding } from '@/core/rounding';
import { TARGET_MAX, TARGET_MIN } from '@/lib/org';

import { useMoney } from '../currency-provider';

import { Sheet } from '../sheet';

/** The figures operators actually name. Anything else is typed. */
const COMMON: readonly number[] = [20, 25, 28, 30, 32, 35];

/**
 * What share of the menu price this dish's food is meant to be.
 *
 * The target is the one figure in the pricing block Costbook cannot know. It
 * is not a fact about the dish, it is the operator's decision about the
 * business — a café working at 20% and a Costbook set to 32% disagree by a
 * third of the menu price, and Costbook has no standing to win that argument.
 *
 * Settings already states that a dish may override it. This is that override,
 * at the point of effect, so no price is set from another screen (PRD 8).
 */
export function TargetSheet({
  open,
  onClose,
  cost,
  orgTarget,
  current,
  rounding,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  /** This dish's total cost per portion, so every option shows a real price. */
  cost: number;
  /** What the account prices at, to return to. */
  orgTarget: number;
  /** What this dish prices at now. */
  current: number;
  rounding: PresetName;
  /** Null returns the dish to the account's figure. */
  onPick: (percent: number | null) => void;
}) {
  const m = useMoney();
  const [typed, setTyped] = useState(String(current));

  // Reopening after a change elsewhere should not show a stale figure.
  useEffect(() => {
    if (open) setTyped(String(current));
  }, [open, current]);

  const priceAt = (percent: number): number | null => {
    if (!Number.isFinite(percent) || percent <= 0 || cost <= 0) return null;
    return applyRounding(cost / (percent / 100), PRESETS[rounding]);
  };

  const typedValue = Number(typed);
  const typedOk =
    Number.isFinite(typedValue) && typedValue >= TARGET_MIN && typedValue <= TARGET_MAX;
  const offered = COMMON.includes(orgTarget) ? COMMON : [...COMMON, orgTarget].sort((a, b) => a - b);

  return (
    <Sheet title="What this dish aims for" open={open} onClose={onClose}>
      <p className="sheet-copy">
        The target is your decision, not Costbook&rsquo;s. It says what share of the menu price the
        food should be, and it is the only figure here we cannot read off your kitchen. Every price
        below is this dish at that target, rounded the way you have chosen.
      </p>

      <ul className="rule-list">
        {offered.map((percent) => {
          const price = priceAt(percent);
          return (
            <li key={percent}>
              <button
                type="button"
                className={`rule-option${percent === current ? ' is-chosen' : ''}`}
                aria-pressed={percent === current}
                onClick={() => onPick(percent === orgTarget ? null : percent)}
              >
                <span className="rule-mark" aria-hidden="true">
                  {percent === current ? (
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2.4 6.2 4.8 8.6 9.6 3.6" />
                    </svg>
                  ) : null}
                </span>
                <span className="rule-label">
                  {percent.toFixed(1)}%
                  {percent === orgTarget ? <span className="rule-note"> your account</span> : null}
                </span>
                <span className="figure rule-price">
                  {price === null ? '—' : m.withSymbol(price)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="target-typed">
        <label className="target-typed-label" htmlFor="target-typed-field">
          Or type another, between {TARGET_MIN}% and {TARGET_MAX}%
        </label>
        <div className="target-typed-row">
          <input
            id="target-typed-field"
            className="set-inline-field figure"
            inputMode="decimal"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <span className="target-typed-unit">%</span>
          <span className="figure target-typed-price">
            {typedOk ? m.withSymbol(priceAt(typedValue) ?? 0) : '—'}
          </span>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!typedOk}
            onClick={() => onPick(typedValue === orgTarget ? null : typedValue)}
          >
            Use {typedOk ? `${typedValue.toFixed(1)}%` : 'it'}
          </button>
        </div>
      </div>

      <p className="sheet-foot-note">
        {current === orgTarget
          ? `This dish follows your account's ${orgTarget.toFixed(1)}%. Changing it here changes this dish alone.`
          : `Your account aims for ${orgTarget.toFixed(1)}%. This dish is set apart from it, and only this dish.`}
      </p>
    </Sheet>
  );
}

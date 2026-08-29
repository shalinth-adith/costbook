'use client';

import { PRESETS, type PresetName, applyRounding, describeRule } from '@/core/rounding';

import { ROUNDING_CHOICES } from '@/lib/costing';


import { useMoney } from '../currency-provider';

import { Sheet } from '../sheet';

/**
 * How prices are rounded.
 *
 * Every option shows what it would actually charge for this dish at this
 * target, so the operator is choosing between real prices rather than between
 * rules in the abstract (A13).
 */
export function RoundingSheet({
  open,
  onClose,
  exact,
  current,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  exact: number;
  current: PresetName;
  onPick: (rule: PresetName) => void;
}) {
  const m = useMoney();
  return (
    <Sheet title="How prices are rounded" open={open} onClose={onClose}>
      <p className="sheet-copy">
        The exact figure at your target is{' '}
        <span className="figure strong">{m.money(exact)}</span>. Nobody puts that on a menu, so
        Costbook rounds it. Pick how.
      </p>

      <ul className="rule-list">
        {ROUNDING_CHOICES.map((name) => {
          const price = applyRounding(exact, PRESETS[name]);
          return (
            <li key={name}>
              <button
                type="button"
                className={`rule-option${name === current ? ' is-chosen' : ''}`}
                aria-pressed={name === current}
                onClick={() => onPick(name)}
              >
                <span className="rule-mark" aria-hidden="true">
                  {name === current ? (
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2.4 6.2 4.8 8.6 9.6 3.6" />
                    </svg>
                  ) : null}
                </span>
                <span className="rule-label">{describeRule(PRESETS[name])}</span>
                <span className="figure rule-price">{m.withSymbol(price)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="sheet-foot-note">
        Every figure shown is this dish at your target, so you are choosing between real prices
        rather than a rule in the abstract.
      </p>
    </Sheet>
  );
}

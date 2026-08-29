'use client';

import { useState } from 'react';

import type { Ingredient } from '@/core/ingredient';



import { useMoney } from '../currency-provider';

import { Sheet } from '../sheet';

/**
 * Set rate.
 *
 * The missing-rate line is the only clay-coloured thing on the screen, and
 * this is where it is answered. Pressing it gives the ingredient a rate,
 * recosts the line, and says how many other recipes just moved — because a
 * rate is shared, and that consequence is invisible from this dish (A13).
 *
 * The figure asked for is what the pack cost, not a per-gram rate. Nobody
 * knows what a gram of podi costs; everybody knows what the tin cost.
 */
export function RateSheet({
  ingredient,
  usedIn,
  onClose,
  onSet,
}: {
  ingredient: Ingredient | null;
  usedIn: number;
  onClose: () => void;
  onSet: (packPrice: number) => void;
}) {
  const m = useMoney();
  const [value, setValue] = useState('');

  if (ingredient === null) return null;

  const entered = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(entered) && entered >= 0;
  const perUnit = valid ? (entered / ingredient.purchaseQty) * factor(ingredient.purchaseUnit) : null;

  return (
    <Sheet
      title={`What does ${ingredient.name} cost?`}
      open
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => { onSet(entered); setValue(''); }}
          >
            Set the rate
          </button>
        </>
      }
    >
      <p className="sheet-copy">
        Costbook has no rate for this, so any dish using it reports a floor rather than a cost.
        Enter what you paid for the pack — not a rate per gram.
      </p>

      <label className="field">
        <span className="label">
          What one {displayPack(ingredient)} costs
        </span>
        <div className="money-field">
          <span className="figure money-symbol">{m.symbol}</span>
          <input
            className="figure"
            inputMode="decimal"
            value={value}
            autoFocus
            placeholder="0.00"
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </label>

      {perUnit === null ? null : (
        <div className="live-note">
          <span className="label">Which works out at</span>
          <div className="figure live-total">
            {m.withSymbol(perUnit)} <span className="live-unit">per {ingredient.purchaseUnit}</span>
          </div>
        </div>
      )}

      {usedIn > 1 ? (
        <p className="sheet-foot-note">
          Used in <strong>{usedIn} recipes</strong>. Setting this rate reprices all of them at
          once, not just this dish.
        </p>
      ) : null}
    </Sheet>
  );
}

function displayPack(ingredient: Ingredient): string {
  const shown = ingredient.purchaseQty / factor(ingredient.purchaseUnit);
  const rounded = Number.isInteger(shown) ? String(shown) : shown.toFixed(2);
  return `${rounded} ${ingredient.purchaseUnit} pack`;
}

/** Rates invert against quantities: base units per display unit. */
function factor(unit: string): number {
  const table: Record<string, number> = { g: 1, kg: 1000, mg: 0.001, ml: 1, l: 1000, pcs: 1, nos: 1 };
  return table[unit] ?? 1;
}

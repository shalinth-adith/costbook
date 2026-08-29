'use client';

import { useRef, useState } from 'react';

import {
  type IngredientRow,
  deriveRate,
  nearMatches,
  sampleUnit,
} from '@/lib/ingredients';

import { useMoney } from './currency-provider';

const UNITS = ['kg', 'l', 'pc'] as const;

export interface NewIngredient {
  readonly name: string;
  readonly packQty: number;
  readonly packUnit: string;
  readonly packPrice: number | null;
}

/**
 * The entry row, which is the screen.
 *
 * Type a name, a pack quantity and a price, press Enter - the row clears and
 * focus returns to Name, so the second ingredient costs no more than the first.
 * A modal would cost a click to open, take focus, and make the fortieth
 * ingredient as expensive as the first (A19).
 *
 * Four fields and no more. Everything else is optional and lives on the row.
 */
export function IngredientEntry({
  rows,
  compact = false,
  busy,
  seedName,
  onAdd,
  onOpenExisting,
}: {
  rows: readonly IngredientRow[];
  /** Inside a recipe there is less room, and no heading (A20). */
  compact?: boolean;
  busy: boolean;
  /** What was already typed elsewhere, so it is not typed twice (A20). */
  seedName?: string;
  onAdd: (ingredient: NewIngredient) => void;
  onOpenExisting?: (id: string) => void;
}) {
  const m = useMoney();
  const nameField = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(seedName ?? '');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<string>('kg');
  const [price, setPrice] = useState('');

  const packQty = Number(qty);
  const packPrice = price.trim() === '' ? null : Number(price);
  const validQty = qty.trim() !== '' && Number.isFinite(packQty) && packQty > 0;
  const validPrice = packPrice === null || (Number.isFinite(packPrice) && packPrice >= 0);
  const canCommit = name.trim() !== '' && validQty && validPrice;

  const near = nearMatches(rows, name);
  const derived = deriveRate(validQty ? packQty : 0, unit, validPrice ? packPrice : null);

  const commit = () => {
    if (!canCommit || busy) return;
    onAdd({ name: name.trim(), packQty, packUnit: unit, packPrice });
    // The row clears and focus returns to Name, so the next one is free.
    setName('');
    setQty('');
    setPrice('');
    setUnit('kg');
    nameField.current?.focus();
  };

  return (
    <section className={`entry${compact ? ' is-compact' : ''}`}>
      {compact ? null : (
        <header className="entry-head">
          <span className="label">Add an ingredient</span>
          <span className="entry-hint">
            Tab across, Enter to commit. Nothing else is asked - supplier, yield and the rest are
            optional and live on the row.
          </span>
        </header>
      )}

      <div
        className="entry-row"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      >
        <label className="entry-field entry-name">
          <span className="label">Name</span>
          <input
            ref={nameField}
            value={name}
            autoComplete="off"
            placeholder="Onion, big"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="entry-field entry-qty">
          <span className="label">Pack qty</span>
          <input
            className="figure"
            inputMode="decimal"
            value={qty}
            placeholder="1"
            onChange={(e) => setQty(e.target.value)}
          />
        </label>

        <div className="entry-field entry-unit">
          <span className="label">Unit</span>
          <div className="segmented segmented-xs" role="group" aria-label="Unit">
            {UNITS.map((u) => (
              <button
                key={u}
                type="button"
                className={`segmented-item${unit === u ? ' is-active' : ''}`}
                aria-pressed={unit === u}
                onClick={() => setUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <label className="entry-field entry-price">
          <span className="label">Price for the pack</span>
          <div className="money-field entry-money">
            <span className="figure money-symbol">{m.symbol}</span>
            <input
              className="figure"
              inputMode="decimal"
              value={price}
              placeholder="0.00"
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </label>

        <button type="button" className="btn btn-primary" disabled={!canCommit || busy} onClick={commit}>
          {busy ? 'Adding...' : 'Add'}
        </button>
      </div>

      {/* Two entries for one ingredient is the failure that quietly makes
          costing wrong, and this row is the only place to catch it. */}
      {near.length > 0 ? (
        <div className="entry-near">
          <span className="entry-near-said">
            You already have {near.length} like this. Open it instead of making a second.
          </span>
          <ul className="entry-near-list">
            {near.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="entry-near-row"
                  onClick={() => onOpenExisting?.(r.id)}
                >
                  <span className="entry-near-name">{r.name}</span>
                  <span className="figure entry-near-rate">
                    {r.rate === null ? 'no rate' : `${m.withSymbol(r.rate)} / ${r.unit}`}
                  </span>
                  <span className="entry-near-used">in {r.usedIn} recipes</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* The sum shows before the keystroke, not after it. */}
      {derived.perUnit === null ? (
        compact ? null : (
          <p className="entry-note">
            Unit defaults to kg because it is right most of the time. Yield stays at 100% and is
            set later, from the row.
          </p>
        )
      ) : (
        <p className="entry-derived">
          <span className="figure strong">
            {m.withSymbol(derived.perUnit)} / {unit}
          </span>
          {' · '}
          <span className="figure">
            {derived.sampleQty} {sampleUnit(unit)} = {m.withSymbol(derived.sampleCost)}
          </span>
          <span className="entry-derived-said"> is what a recipe line will cost. Enter to commit.</span>
        </p>
      )}
    </section>
  );
}

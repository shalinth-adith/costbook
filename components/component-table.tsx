'use client';

import { useState } from 'react';

import type { CostedLine } from '@/core/recipe';

import { rateUnitOf, DASH, lineQty, lineRate, qty, shownQty } from '@/lib/format';
import { looseNumber } from '@/core/loose';
import { toBase } from '@/core/units';

import { useMoney } from './currency-provider';

import { Stepper } from './stepper';

export interface LineHandlers {
  /**
   * Portions in the batch, so a per-portion line can show what it contributes
   * to the batch rather than to one plate. Without it the Line cost column
   * does not add up to the batch total, and a column an owner cannot add up
   * is a column they stop trusting.
   */
  readonly portions: number | null;
  readonly onQty: (index: number, value: number) => void;
  readonly onScope: (index: number) => void;
  readonly onRemove: (index: number) => void;
  readonly onExpand: (index: number) => void;
  /** The clay-coloured line is the only one that opens this. */
  readonly onSetRate: (index: number) => void;
  readonly expanded: number;
  readonly usedInCount: (name: string) => number;
}

/**
 * The component lines, and the centre of the screen.
 *
 * A row expands rather than opening a dialog: nothing that affects a dish's
 * cost should require leaving that dish. Expansion pushes content down and
 * never up, so the line just clicked stays where the eye left it.
 */
export function ComponentTable({
  lines,
  handlers,
}: {
  lines: readonly CostedLine[];
  handlers: LineHandlers;
}) {
  const m = useMoney();
  return (
    <div className="ctable">
      <div className="ctable-head">
        <span />
        <span>Component</span>
        <span>Share of batch</span>
        <span className="end">Qty</span>
        <span>Unit</span>
        <span className="end">Rate / unit</span>
        <span className="end">Line cost</span>
        <span />
      </div>

      {lines.map((line, i) => {
        const isOpen = handlers.expanded === i;
        const inBatch =
          line.cost === null
            ? null
            : line.scope === 'portion'
              ? line.cost * (handlers.portions ?? 1)
              : line.cost;
        /*
         * This line's share of the batch, as a bar.
         *
         * The name column used to swallow every pixel the numbers did not
         * need — at 2000px that was a thousand of them, empty. A bar in that
         * space is the one thing a cook reads faster than the figures: which
         * three lines are the cost of this dish. Nineteen rows is a trivial
         * sum, so it is computed here rather than threaded through as a prop.
         */
        const batchTotal = lines.reduce(
          (sum, l) =>
            sum + (l.cost === null ? 0 : l.scope === 'portion' ? l.cost * (handlers.portions ?? 1) : l.cost),
          0,
        );
        const share = batchTotal > 0 && inBatch !== null ? Math.min(100, (inBatch / batchTotal) * 100) : 0;
        /*
         * The bar is drawn against the dearest line, not the batch: nineteen
         * lines of two to four per cent each are slivers against a batch, and
         * a chart of slivers says nothing. Against the largest line the shape
         * is readable — and the honest figure, the share of the batch, is
         * written beside it so the bar never has to be.
         */
        const maxLine = lines.reduce((mx, l) => {
          const v = l.cost === null ? 0 : l.scope === 'portion' ? l.cost * (handlers.portions ?? 1) : l.cost;
          return v > mx ? v : mx;
        }, 0);
        const bar = maxLine > 0 && inBatch !== null ? (inBatch / maxLine) * 100 : 0;

        return (
          <div key={`${line.name}-${i}`}>
            <div
              className={`ctable-row${line.cost === null ? ' is-missing' : ''}${isOpen ? ' is-open' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
              role="button"
              tabIndex={0}
              aria-expanded={isOpen}
              onClick={() => handlers.onExpand(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.onExpand(i); }
              }}
            >
              <span className="figure ctable-n">{String(i + 1).padStart(2, '0')}</span>

              <span className="ctable-name">
                {line.kind === 'recipe' ? (
                  <span className="sub-marker">
                    <span className="figure sub-badge">SUB</span>
                    <span className="ctable-label">
                      <span className="ctable-title is-link">{line.name}</span>
                      <span className="ctable-note">{line.note}</span>
                    </span>
                  </span>
                ) : (
                  <span className="ctable-label indent">
                    <span className="ctable-title">{line.name}</span>
                    {line.note !== null ? (
                      <span className="ctable-note">{line.note}</span>
                    ) : line.entryMode === 'spend' ? (
                      <span className="ctable-note">rate worked out from what you spent</span>
                    ) : line.kind === 'flat' ? (
                      <span className="ctable-note">a charge, not a measurement</span>
                    ) : null}
                  </span>
                )}
              </span>

              <span className="ctable-share" aria-hidden="true">
                <span className="ctable-share-track">
                  <span
                    className={`ctable-share-fill${line.cost === null ? ' is-missing' : ''}`}
                    style={{ width: `${String(bar)}%` }}
                  />
                </span>
                <span className="figure ctable-share-pct">{share >= 0.5 ? `${String(Math.round(share))}%` : ''}</span>
              </span>

              <span className="ctable-qty-cell">
                {line.kind === 'flat' ? null : (
                  <span className="figure ctable-qty">{shownQty(line.qty, line.unit).qty}</span>
                )}
              </span>

              {/* Grams below a kilo, millilitres below a litre. "0.03 l" of
                  ghee is 30 ml to anyone who has poured it. */}
              <span className="figure ctable-unit">{shownQty(line.qty, line.unit).unit}</span>
              <span className="figure end ctable-dim">{m.rate(lineRate(line.ratePerBaseUnit, rateUnitOf(line.unit)))}<span className="ctable-rate-unit">/{rateUnitOf(line.unit)}</span></span>

              <span className="ctable-cost">
                {line.scope === 'portion' ? (
                  <span className="chip chip-scope figure">PER PORTION</span>
                ) : null}
                {line.cost === null ? (
                  <button
                    type="button"
                    className="btn-set-rate"
                    onClick={(e) => { e.stopPropagation(); handlers.onSetRate(i); }}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" />
                    </svg>
                    Set rate
                  </button>
                ) : (
                  <span className="figure ctable-total">{m.money(inBatch)}</span>
                )}
              </span>

              <span className="ctable-more">
                <span className={`icon-btn${isOpen ? ' is-open' : ''}`} aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                    <path d="m3 4.6 3 3 3-3" />
                  </svg>
                </span>
              </span>
            </div>

            {isOpen ? (
              <div onClick={(e) => e.stopPropagation()}>
                <LineDetail line={line} index={i} handlers={handlers} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LineDetail({
  line,
  index,
  handlers,
}: {
  line: CostedLine;
  index: number;
  handlers: LineHandlers;
}) {
  const uses = handlers.usedInCount(line.name);

  return (
    <div className="line-detail">
      <div className="line-detail-grid">
        <div>
          <div className="label">Quantity</div>
          {/* A stepper rather than a field: a wet finger cannot select and
              retype a number, and a field that clears on focus loses the
              figure it was showing (A13). */}
          <div className="qty-edit">
            {/*
              * Typed, beside the stepper — not instead of it.
              *
              * The stepper is right for a wet finger on a tablet. It is wrong
              * for somebody at a laptop entering a recipe: a picked line
              * starts at 1 kg, the steps are 50/10/5/1 g, and reaching 250 g
              * is about thirty presses. Nobody enters a recipe that way; they
              * type "250 g". So here is where they type it. Enter or leaving
              * the field commits; the unit stays the line's own.
              */}
            <QtyField
              line={line}
              disabled={line.kind === 'flat'}
              onCommit={(base) => handlers.onQty(index, base)}
            />
            <Stepper
              label={`quantity of ${line.name}`}
              value={`${shownQty(line.qty, line.unit).qty} ${shownQty(line.qty, line.unit).unit}`}
              min={line.qty <= 1}
              disabled={line.kind === 'flat'}
              onDown={() => handlers.onQty(index, stepDown(line.qty))}
              onUp={() => handlers.onQty(index, stepUp(line.qty))}
            />
          </div>
          <p className="line-detail-copy">
            {line.cost === null ? (
              <>
                <strong>{line.name} has no rate on file.</strong> It counts as zero until you give
                it one, which is why this dish reports a floor and no price is offered.
              </>
            ) : line.entryMode === 'spend' ? (
              <>
                Entered as a spend, so the rate above was worked out from it. This line will
                <strong> not </strong>follow the ingredient when its rate changes.
              </>
            ) : line.entryMode === 'rate' ? (
              <>
                A rate was typed on this line, overriding the one on file. Yield still applies — it
                is a property of the thing bought, not of how it was priced.
              </>
            ) : (
              <>
                Costed from the rate on file. Change that rate and this line follows it.
              </>
            )}
          </p>
        </div>

        <div>
          <div className="label">Applies</div>
          <div className="scope-toggle" role="group" aria-label="How this line applies">
            <button
              type="button"
              className={`scope-option${line.scope === 'batch' ? ' is-active' : ''}`}
              onClick={() => { if (line.scope !== 'batch') handlers.onScope(index); }}
            >
              across the batch
            </button>
            <button
              type="button"
              className={`scope-option${line.scope === 'portion' ? ' is-active' : ''}`}
              onClick={() => { if (line.scope !== 'portion') handlers.onScope(index); }}
            >
              to each portion
            </button>
          </div>
          <p className="line-detail-copy">
            Ghee drizzled on every plate is not the same as ghee stirred into the batch. The second
            divides by the portion count; the first does not.
          </p>
        </div>

        <div>
          {/* Quieter than the switch beside it. Which other dishes an
              ingredient is in is about the ingredient; whether this line is
              per batch or per plate is about this dish, and that is the one
              a cook is here to settle. */}
          <p className="line-detail-aside">
            {uses > 1 ? (
              <>Also in <strong>{uses - 1}</strong> other {uses - 1 === 1 ? 'dish' : 'dishes'} — a rate change reaches all of them.</>
            ) : (
              <>Only in this dish so far.</>
            )}
          </p>
          <div className="line-detail-actions">
            {line.cost === null ? (
              <button type="button" className="btn-set-rate" onClick={() => handlers.onSetRate(index)}>
                <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" />
                </svg>
                Set rate
              </button>
            ) : null}
            <button type="button" className="link link-sm" onClick={() => handlers.onRemove(index)}>
              Remove this line
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * The quantity, typed.
 *
 * Holds its own draft so a half-typed "25" is not committed as 25 g on the
 * way to "250". Commits on Enter and on blur; a cleared or unreadable field
 * commits nothing, because `setQty` treats zero as a removal and a typo
 * should not delete a line.
 */
function QtyField({
  line,
  disabled,
  onCommit,
}: {
  line: { readonly qty: number; readonly unit: string; readonly name: string };
  disabled: boolean;
  onCommit: (baseQty: number) => void;
}) {
  // In the unit a cook says it in, so "40" typed against "30 ml" means 40 ml.
  const sh = shownQty(line.qty, line.unit);
  const shown = sh.qty;
  const [draft, setDraft] = useState(shown);
  const [was, setWas] = useState(shown);
  // A change from outside — the stepper — replaces the draft.
  if (shown !== was) {
    setWas(shown);
    setDraft(shown);
  }

  const commit = () => {
    const n = looseNumber(draft);
    if (n === null || n <= 0) {
      setDraft(shown);
      return;
    }
    let base: number;
    try {
      base = toBase(n, sh.unit);
    } catch {
      setDraft(shown);
      return;
    }
    if (base !== line.qty) onCommit(base);
  };

  return (
    <label className="qty-field">
      <input
        className="figure"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        aria-label={`quantity of ${line.name} in ${sh.unit}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="qty-unit">{sh.unit}</span>
    </label>
  );
}

/** A step that suits the figure: grams move in tens, pieces in ones. */
function stepSize(value: number): number {
  if (value >= 500) return 50;
  if (value >= 100) return 10;
  if (value >= 20) return 5;
  if (value >= 5) return 1;
  return 0.5;
}

const stepUp = (value: number): number => round(value + stepSize(value));
const stepDown = (value: number): number => Math.max(stepSize(value), round(value - stepSize(value)));
const round = (value: number): number => Math.round(value * 100) / 100;

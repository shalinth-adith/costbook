'use client';

import type { CostedLine } from '@/core/recipe';

import { DASH, money, qty, rate } from '@/lib/format';

import type { LineHandlers } from './component-table';

/**
 * The same lines as stacked cards, for a tablet held in a kitchen (A5).
 *
 * Not a morph of the table — the shapes are too different, the result reads as
 * broken, and it costs far more to build than it returns. The two layouts
 * cross-fade and share one set of handlers, so an edit made in either gives
 * the same result and switching mid-edit loses nothing.
 */
export function ComponentCards({
  lines,
  handlers,
}: {
  lines: readonly CostedLine[];
  handlers: LineHandlers;
}) {
  return (
    <div className="ccards">
      {lines.map((line, i) => {
        const isOpen = handlers.expanded === i;
        const inBatch =
          line.cost === null
            ? null
            : line.scope === 'portion'
              ? line.cost * (handlers.portions ?? 1)
              : line.cost;
        // Reported by whoever resolved the ingredient, not looked up again here.
        const yieldText = line.yieldPercent === null ? DASH : `${line.yieldPercent}%`;

        return (
          <article key={`${line.name}-${i}`} className={`ccard${line.cost === null ? ' is-missing' : ''}`}>
            <header className="ccard-head">
              <span className="figure ccard-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="ccard-title-block">
                <span className="ccard-title">
                  {line.kind === 'recipe' ? <span className="figure sub-badge">SUB</span> : null}
                  {line.name}
                </span>
                {line.scope === 'portion' ? (
                  <span className="chip chip-scope figure">PER PORTION</span>
                ) : null}
              </span>
              <button
                type="button"
                className={`icon-btn${isOpen ? ' is-open' : ''}`}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${line.name}`}
                onClick={() => handlers.onExpand(i)}
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                  <path d="m3 4.6 3 3 3-3" />
                </svg>
              </button>
            </header>

            <div className="ccard-fields">
              <label className="ccard-field">
                <span className="label">Qty</span>
                {line.kind === 'flat' ? (
                  <span className="figure ccard-value">{DASH}</span>
                ) : (
                  <span className="ccard-qty">
                    <input
                      className="figure qty-input"
                      type="number"
                      min={0}
                      step="any"
                      value={qty(line.qty)}
                      aria-label={`Quantity of ${line.name}`}
                      onChange={(e) => handlers.onQty(i, Number(e.target.value))}
                    />
                    <span className="figure ccard-unit">{line.unit}</span>
                  </span>
                )}
              </label>

              <span className="ccard-field">
                <span className="label">Yield</span>
                <span className="figure ccard-value">{yieldText}</span>
              </span>

              <span className="ccard-field">
                <span className="label">Rate / unit</span>
                <span className="figure ccard-value">{rate(line.ratePerBaseUnit)}</span>
              </span>

              <span className="ccard-field end">
                <span className="label">Line cost</span>
                {line.cost === null ? (
                  <button type="button" className="btn-set-rate" onClick={() => handlers.onSetRate(i)}>
                    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" />
                    </svg>
                    Set rate
                  </button>
                ) : (
                  <span className="figure ccard-total">{money(inBatch)}</span>
                )}
              </span>
            </div>

            {isOpen ? (
              <div className="ccard-detail">
                <div className="scope-toggle" role="group" aria-label="How this line applies">
                  <button
                    type="button"
                    className={`scope-option${line.scope === 'batch' ? ' is-active' : ''}`}
                    onClick={() => { if (line.scope !== 'batch') handlers.onScope(i); }}
                  >
                    across the batch
                  </button>
                  <button
                    type="button"
                    className={`scope-option${line.scope === 'portion' ? ' is-active' : ''}`}
                    onClick={() => { if (line.scope !== 'portion') handlers.onScope(i); }}
                  >
                    to each portion
                  </button>
                </div>
                <button type="button" className="link link-sm" onClick={() => handlers.onRemove(i)}>
                  Remove this line
                </button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

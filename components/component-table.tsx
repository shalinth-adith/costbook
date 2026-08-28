import type { CostedLine } from '@/core/recipe';

import { DASH, money, qty, rate } from '@/lib/format';

/**
 * The component lines. This is the centre of the screen and roughly the reason
 * the product exists: quantity, yield, rate and line cost, with a sub-recipe
 * reading as one line that carries its own cost across.
 */
export function ComponentTable({ lines }: { lines: readonly CostedLine[] }) {
  return (
    <div className="ctable" role="table" aria-label="Component lines">
      <div className="ctable-head" role="row">
        <span role="columnheader" />
        <span role="columnheader">Component</span>
        <span role="columnheader" className="end">Qty</span>
        <span role="columnheader">Unit</span>
        <span role="columnheader" className="end">Yield</span>
        <span role="columnheader" className="end">Rate / unit</span>
        <span role="columnheader" className="end">Line cost</span>
        <span role="columnheader" />
      </div>

      {lines.map((line, i) => (
        <div
          key={`${line.name}-${i}`}
          role="row"
          className={`ctable-row${line.cost === null ? ' is-missing' : ''}`}
        >
          <span className="figure ctable-n">{String(i + 1).padStart(2, '0')}</span>

          <span className="ctable-name">
            {line.kind === 'recipe' ? (
              <span className="sub-marker">
                <span className="figure sub-badge">SUB</span>
                <span className="ctable-label">
                  <span className="ctable-title is-link">{line.name}</span>
                  <span className="ctable-note">own recipe</span>
                </span>
              </span>
            ) : (
              <span className="ctable-label indent">
                <span className="ctable-title">{line.name}</span>
                {line.entryMode === 'spend' ? (
                  <span className="ctable-note">rate worked out from what you spent</span>
                ) : line.entryMode === 'rate' ? (
                  <span className="ctable-note">rate entered on this line</span>
                ) : line.kind === 'flat' ? (
                  <span className="ctable-note">a charge, not a measurement</span>
                ) : null}
              </span>
            )}
          </span>

          <span className="figure end ctable-qty">{line.kind === 'flat' ? '' : qty(line.qty)}</span>
          <span className="figure ctable-unit">{line.unit}</span>
          <span className="figure end ctable-dim">{line.kind === 'ingredient' ? '' : DASH}</span>
          <span className="figure end ctable-dim">{rate(line.ratePerBaseUnit)}</span>

          <span className="ctable-cost">
            {line.scope === 'portion' ? (
              <span className="chip chip-scope figure">PER PORTION</span>
            ) : null}
            {line.cost === null ? (
              <button type="button" className="btn-set-rate">
                <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" />
                </svg>
                Set rate
              </button>
            ) : (
              <span className="figure ctable-total">{money(line.cost)}</span>
            )}
          </span>

          <span className="ctable-more">
            <button type="button" className="icon-btn" aria-label={`More options for ${line.name}`}>
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="m3 4.6 3 3 3-3" />
              </svg>
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

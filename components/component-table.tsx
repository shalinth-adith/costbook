'use client';

import type { CostedLine } from '@/core/recipe';

import { DASH, money, qty, rate } from '@/lib/format';

import { Stepper } from './stepper';

export interface LineHandlers {
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
  return (
    <div className="ctable">
      <div className="ctable-head">
        <span />
        <span>Component</span>
        <span className="end">Qty</span>
        <span>Unit</span>
        <span className="end">Rate / unit</span>
        <span className="end">Line cost</span>
        <span />
      </div>

      {lines.map((line, i) => {
        const isOpen = handlers.expanded === i;

        return (
          <div key={`${line.name}-${i}`}>
            <div
              className={`ctable-row${line.cost === null ? ' is-missing' : ''}${isOpen ? ' is-open' : ''}`}
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
                    <span className="figure sub-badge">DISH</span>
                    <span className="ctable-label">
                      <span className="ctable-title is-link">{line.name}</span>
                      <span className="ctable-note">
                        you make this, and it carries its own cost and yield across
                      </span>
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

              <span className="ctable-qty-cell">
                {line.kind === 'flat' ? null : (
                  <span className="figure ctable-qty">{qty(line.qty)}</span>
                )}
              </span>

              <span className="figure ctable-unit">{line.unit}</span>
              <span className="figure end ctable-dim">{rate(line.ratePerBaseUnit)}</span>

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
                  <span className="figure ctable-total">{money(line.cost)}</span>
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
          <Stepper
            label={`quantity of ${line.name}`}
            value={`${qty(line.qty)} ${line.unit}`}
            min={line.qty <= 1}
            disabled={line.kind === 'flat'}
            onDown={() => handlers.onQty(index, stepDown(line.qty))}
            onUp={() => handlers.onQty(index, stepUp(line.qty))}
          />
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
          <div className="label">Elsewhere</div>
          <p className="line-detail-copy">
            {uses > 1 ? (
              <>
                Used in <strong>{uses} recipes</strong>. Changing its rate reprices all of them at
                once.
              </>
            ) : (
              <>Used only here so far.</>
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

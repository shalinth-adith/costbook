'use client';

import type { CostedLine } from '@/core/recipe';

import type { DishMeta } from '@/lib/data';
import { lineQty, qty } from '@/lib/format';
import type { MethodLine } from '@/lib/prep';

/**
 * A8, and the chef's half of the product.
 *
 * Not a sheet but a view swap, because it is a different document: the same
 * component lines with the costs deliberately absent. A sheet taped where
 * staff and suppliers can read it is not where margins belong (A13).
 *
 * Set in mono throughout, because it is printed on a laser printer and taped
 * to a wall, and read at arm's length by someone holding a pan.
 */
export function PrepCard({
  name,
  dish,
  portions,
  lines,
  steps,
  prepTime,
  contains,
  doNot,
  orgName,
  onBack,
}: {
  name: string;
  dish: DishMeta;
  portions: number | null;
  lines: readonly CostedLine[];
  /** The method as written, never renumbered. */
  steps: readonly MethodLine[];
  prepTime: string | null;
  /** Allergens, in the kitchen's words. Printed, never costed. */
  contains: readonly string[];
  doNot: string | null;
  /** The café's own name. This sheet is taped up in their kitchen. */
  orgName: string;
  onBack: () => void;
}) {
  return (
    <div className="prep-wrap">
      <div className="prep-actions no-print">
        <button type="button" className="btn" onClick={onBack}>
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M7.6 2.6 4.6 6l3 3.4" />
          </svg>
          Back to costing
        </button>
        <span className="prep-size">A4 at 100%</span>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M6.2 7V4.4h7.6V7M5 7h10v9.2H5Z" />
            <path d="M7.6 11.4h4.8" />
          </svg>
          Send to the printer
        </button>
      </div>

      <article className="prep">
        <header className="prep-head">
          <div className="prep-kicker">PREP CARD · {dish.category.toUpperCase()}</div>
          <h1 className="prep-name">{name}</h1>
        </header>

        <dl className="prep-facts">
          <Fact term="STATION" value={(dish.station ?? 'ANY').toUpperCase()} />
          <Fact term="BATCH" value={portions === null ? 'ONE BATCH' : `${portions} PLATES`} />
          <Fact term="PORTION" value={dish.portionSize === null ? '1 PLATE' : `1 PLATE · ${dish.portionSize}`} />
          {prepTime === null ? null : <Fact term="PREP TIME" value={prepTime.toUpperCase()} />}
          {contains.length === 0 ? null : (
            <Fact term="CONTAINS" value={contains.join(' · ').toUpperCase()} />
          )}
        </dl>

        <section className="prep-section">
          <h2 className="prep-h2">COMPONENTS FOR THE BATCH</h2>
          <ul className="prep-lines">
            {lines.map((line, i) => (
              <li key={`${line.name}-${i}`} className="prep-line">
                <span className="prep-line-mark">{line.kind === 'recipe' ? 'SUB' : ''}</span>
                <span className="prep-line-name">{line.name}</span>
                <span className="prep-line-qty">
                  {line.kind === 'flat' ? '' : `${lineQty(line.qty, line.unit)} ${line.unit}`}
                </span>
                <span className="prep-line-note">
                  {line.scope === 'portion' ? 'one per plate' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* An absent method is stated, not omitted. This sheet is read at arm's
            length by someone holding a pan, and a missing section reads as a
            printing fault rather than as an answer. */}
        {steps.length === 0 ? (
          <section className="prep-section">
            <h2 className="prep-h2">METHOD</h2>
            <p className="prep-absent">
              Not written down yet. Add it on the dish and it prints here.
            </p>
          </section>
        ) : (
          <section className="prep-section">
            <h2 className="prep-h2">METHOD</h2>
            {/* No list markers and no numbering of our own: the operator's
                text already carries theirs, and the kitchen knows it by it. */}
            <div className="prep-method">
              {steps.map((line, i) =>
                line.heading ? (
                  <p key={i} className="prep-method-head">{line.text}</p>
                ) : (
                  <p key={i} className="prep-method-line">{line.text}</p>
                ),
              )}
            </div>
          </section>
        )}

        {doNot === null ? null : (
          <section className="prep-section prep-donot">
            <h2 className="prep-h2">DO NOT</h2>
            <p className="prep-donot-copy">{doNot}</p>
          </section>
        )}

        <footer className="prep-foot">
          <span>{orgName.toUpperCase()} · COSTBOOK</span>
          <span>CHECKED BY ___________</span>
        </footer>
      </article>

      <p className="prep-note no-print">
        The same component lines as the costing view, the same quantities, no money. Editing a
        quantity there changes what prints here, which is the point of the two views sharing one
        set of data. A sheet taped where staff and suppliers can read it is not where margins
        belong.
      </p>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="prep-fact">
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
}

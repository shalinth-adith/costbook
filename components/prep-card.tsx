'use client';

import Link from 'next/link';

import { Mark } from './mark';

import type { BreakdownLine } from '@/lib/breakdown';
import { totals } from '@/lib/breakdown';
import type { DishMeta } from '@/lib/data';
import { lineQty } from '@/lib/format';
import { EXPORT_PASS } from '@/lib/org';
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
  canTake,
  onBack,
}: {
  name: string;
  dish: DishMeta;
  portions: number | null;
  /**
   * Every line in the dish, all the way down — the sub-recipes as headings
   * with what they are made of underneath. A cook holding a pan needs the
   * coffee powder and the water, not "Decoction, 300 ml".
   */
  lines: readonly BreakdownLine[];
  /** The method as written, never renumbered. */
  steps: readonly MethodLine[];
  prepTime: string | null;
  /** Allergens, in the kitchen's words. Printed, never costed. */
  contains: readonly string[];
  doNot: string | null;
  /** The café's own name. This sheet is taped up in their kitchen. */
  orgName: string;
  /**
   * Whether this account may take the card off the screen.
   *
   * Reading is free — the card draws in full either way. Printing it is what
   * is bought, once, on a free book.
   */
  canTake: boolean;
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
        {/*
          * The card is drawn in full whether or not it can be printed. What
          * is bought is carrying it away — a locked card that showed nothing
          * would be hiding the thing somebody is deciding whether to buy.
          */}
        {canTake ? (
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6.2 7V4.4h7.6V7M5 7h10v9.2H5Z" />
              <path d="M7.6 11.4h4.8" />
            </svg>
            Send to the printer
          </button>
        ) : (
          <Link href="/plans#takeaway" className="btn btn-primary">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6.6 9V6.6a3.4 3.4 0 016.8 0V9M5.4 9h9.2v6.6H5.4Z" />
            </svg>
            Print it · {EXPORT_PASS.symbol}{EXPORT_PASS.amount} once
          </Link>
        )}
      </div>

      <PrepSheet
        name={name}
        dish={dish}
        portions={portions}
        lines={lines}
        steps={steps}
        prepTime={prepTime}
        contains={contains}
        doNot={doNot}
        orgName={orgName}
        canTake={canTake}
      />

      <p className="prep-note no-print">
        The same lines as the costing view, opened all the way down, and no money on any of them.
        Editing a quantity there changes what prints here, which is the point of the two views
        sharing one set of data. A sheet taped where staff and suppliers can read it is not where
        margins belong.
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


/**
 * The sheet itself, with no controls around it.
 *
 * Split out so one document can be framed two ways: a single card with a
 * printer button beside it, and a run of every dish for a kitchen that wants
 * the whole folder at once. A second copy of this markup would be a second
 * card, and the two would drift the first time a line was added.
 */
export function PrepSheet({
  name,
  dish,
  portions,
  lines,
  steps,
  prepTime,
  contains,
  doNot,
  orgName,
  canTake,
}: {
  name: string;
  dish: DishMeta;
  portions: number | null;
  lines: readonly BreakdownLine[];
  steps: readonly MethodLine[];
  prepTime: string | null;
  contains: readonly string[];
  doNot: string | null;
  orgName: string;
  /**
   * Which mark the sheet wears.
   *
   * Unlocked — a plan, or the pass — it is a maker's signature in the corner
   * and nothing across the middle: this is the kitchen's own document and it
   * should look like one. Locked, it carries the full mark, and it carries it
   * ON SCREEN, because a card that only watermarked what it printed would be
   * a card anybody could photograph instead.
   */
  canTake: boolean;
}) {
  const shelf = totals(lines);

  return (
      <article className="prep">
        {/*
          * The mark, and which one.
          *
          * A kitchen that has paid gets a signature: the bars and the name in
          * the corner of the footer, the way a maker signs a thing rather
          * than stamps it. A kitchen still on the trial gets the full mark
          * across the sheet — and gets it on screen, not only on the paper,
          * because the point is not to spoil a printout. The point is that a
          * card carried away in a photograph is carried away all the same.
          */}
        {canTake ? null : (
          <div className="prep-mark" aria-hidden="true">
            <span>COSTBOOK</span>
            <span>COSTBOOK</span>
            <span>COSTBOOK</span>
            <span>COSTBOOK</span>
            <span>COSTBOOK</span>
            <span>COSTBOOK</span>
          </div>
        )}

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

        {/*
          * Everything in the dish, to the bottom.
          *
          * The costing screen is right to show a sub-recipe as one line — the
          * gravy costs what the gravy costs. A cook is holding a pan, and
          * "Decoction, 300 ml" is not something you can take off a shelf. So
          * the sub-recipe stays as a heading, and what it is made of prints
          * underneath it, in the amount THIS batch needs.
          */}
        <section className="prep-section">
          <h2 className="prep-h2">EVERYTHING IN ONE BATCH</h2>
          <ul className="prep-lines">
            {lines.map((line, i) => (
              <li
                key={`${line.name}-${String(i)}`}
                className={`prep-line${line.kind === 'recipe' ? ' is-sub' : ''}`}
                style={{ '--d': line.depth } as React.CSSProperties}
              >
                <span className="prep-line-mark">{line.kind === 'recipe' ? 'MAKE' : ''}</span>
                <span className="prep-line-name">{line.name}</span>
                <span className="prep-line-qty">
                  {line.kind === 'flat' ? '' : `${lineQty(line.qty, line.unit)} ${line.unit}`}
                </span>
                <span className="prep-line-note">
                  {line.note ?? (line.via.length === 0 ? '' : `for the ${line.via.at(-1) ?? ''}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/*
          * The same batch as a shelf list.
          *
          * The tree above says where each thing goes; this says how much to
          * fetch. Both are true and neither can be read off the other at
          * speed — powder that appears in two sub-recipes is two lines up
          * there and one trip to the store down here.
          */}
        {shelf.length > 1 && (
          <section className="prep-section prep-shelf">
            <h2 className="prep-h2">OFF THE SHELF, IN TOTAL</h2>
            <ul className="prep-shelf-list">
              {shelf.map((t) => (
                <li key={`${t.name}-${t.unit}`}>
                  <span>{t.name}</span>
                  <span className="prep-shelf-qty">{lineQty(t.qty, t.unit)} {t.unit}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

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
          <span className="prep-foot-mark">
            {orgName.toUpperCase()} · COSTED WITH
            <Mark size={11} />
            <b>COSTBOOK</b>
            {/* The trademark sign, small, where a maker signs. */}
            <sup aria-hidden="true">™</sup>
          </span>
          <span>CHECKED BY ___________</span>
        </footer>
      </article>
  );
}

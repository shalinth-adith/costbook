'use client';

import Link from 'next/link';

import type { FirstDish } from '@/lib/first-dish';
import { whenSent } from '@/lib/flags';

import { useMoney } from './currency-provider';

/**
 * A42 states two and three — one dish costed, and the moment a rate moves it.
 *
 * The third state is the whole argument of the product. Someone who has costed
 * one dish by hand has seen a calculator; the moment ghee moves and their dosa
 * follows without them touching it is the first time this is different from a
 * spreadsheet, and on a menu of one it can be shown in a single line.
 *
 * Per A15 no figure animates its value. The "was" is struck and the "now"
 * stands beside it; nothing counts between them.
 */
export function DashboardFirst({
  state,
  target,
  today,
}: {
  state: Extract<FirstDish, { kind: 'one' | 'moved' }>;
  target: number;
  /** ISO date, from the server, so "this morning" is not the browser's guess. */
  today: string;
}) {
  const m = useMoney();
  const { dish } = state;
  const moved = state.kind === 'moved' ? state.move : null;

  return (
    <div className="fd fd-one">
      {moved === null ? null : (
        <section className="fd-moved">
          <h1 className="fd-h">
            {moved.ingredient} {moved.rose ? 'went up' : 'came down'}{' '}
            {whenSent(moved.on, today)}, so your {dish.name} did too.
          </h1>
          <p className="fd-lede">
            You changed nothing. This is the part a spreadsheet can&rsquo;t do — and it will do it
            across your whole menu once the rest is in.
          </p>
          {moved.wasFoodCostPercent === null || dish.foodCostPercent === null ? null : (
            <div className="fd-swing">
              <span className="fd-swing-cell">
                <span className="fd-swing-label">Was</span>
                <span className="figure fd-swing-was">
                  {moved.wasFoodCostPercent.toFixed(1)}%
                </span>
              </span>
              <span className="fd-swing-cell">
                <span className="fd-swing-label">Now</span>
                <span className="figure fd-swing-now">{dish.foodCostPercent.toFixed(1)}%</span>
              </span>
            </div>
          )}
        </section>
      )}

      <section className="fd-card">
        <div className="fd-card-head">
          <div>
            <h2 className="fd-h2">One dish costed</h2>
            <p className="fd-card-said">
              <span className="figure">{state.ingredients}</span>{' '}
              {state.ingredients === 1 ? 'ingredient' : 'ingredients'} on file. Your target is{' '}
              <span className="figure">{target}%</span>.
            </p>
          </div>
          <Link href="/recipes?new=1" className="btn">Cost another</Link>
        </div>

        <Link href={`/recipes/${dish.id}`} className="fd-dish">
          <span className="fd-dish-said">
            <span className="fd-dish-name">{dish.name}</span>
            <span className="fd-dish-sub">
              {dish.category === '' ? null : `${dish.category} · `}
              {dish.components} {dish.components === 1 ? 'component' : 'components'}
            </span>
          </span>
          <span className="fd-dish-figures">
            <Figure said="Costs you" value={m.withSymbol(dish.costPerPortion)} />
            <Figure
              said="Sells at"
              value={dish.sellingPrice === null ? 'Not set' : m.withSymbol(dish.sellingPrice)}
            />
            <Figure
              said="Share"
              value={dish.foodCostPercent === null ? '—' : `${dish.foodCostPercent.toFixed(1)}%`}
              strong
            />
          </span>
        </Link>
      </section>

      <section className="fd-rest">
        <h2 className="fd-h2">That&rsquo;s one. Nothing else needs you today.</h2>
        <p className="fd-lede">
          Tomorrow morning we&rsquo;ll ask you to confirm a price or two, and this figure will
          follow whatever you say. Add more dishes whenever you like — or bring the rest of the
          menu in at once.
        </p>
        <Link href="/import" className="btn">Bring the rest in</Link>
      </section>
    </div>
  );
}

function Figure({ said, value, strong }: { said: string; value: string; strong?: boolean }) {
  return (
    <span className={`fd-fig${strong === true ? ' is-strong' : ''}`}>
      <span className="fd-fig-said">{said}</span>
      <span className="figure fd-fig-value">{value}</span>
    </span>
  );
}

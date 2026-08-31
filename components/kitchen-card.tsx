'use client';

import Link from 'next/link';
import { useTransition } from 'react';

import { markSeen } from '@/app/flags/actions';

import { type Flag, whenSent } from '@/lib/flags';

import { useMoney } from './currency-provider';

/**
 * The owner's side of a flag (A40).
 *
 * A card on the dashboard, above the numbers, with the cost sheet one press
 * away. It lands where the owner already is — an owner who never opens
 * Costbook is the failure case this feature is for, and putting it anywhere
 * else means building a messaging product inside a costing one.
 */
export function KitchenCard({ flags, today }: { flags: readonly Flag[]; today: string }) {
  const m = useMoney();
  const [pending, start] = useTransition();

  const open = flags.filter((f) => f.seenAt === null);
  if (open.length === 0) return null;

  const [first, ...rest] = open;
  if (first === undefined) return null;

  return (
    <section className="kc" aria-label="From your kitchen">
      <div className="kc-head">
        <h2 className="kc-title">From your kitchen</h2>
        <span className="kc-count figure">{open.length} unread</span>
      </div>

      <article className="kc-flag">
        <p className="kc-who">
          {first.from} flagged a dish · {whenSent(first.sentAt, today)}
        </p>
        <p className="kc-what">
          {first.dish} is at{' '}
          <b className="figure">{first.foodCost === null ? '—' : `${first.foodCost.toFixed(0)}%`}</b>.
        </p>
        {/* The one line only a person knows. Everything else, Costbook knew. */}
        {first.note === null ? null : <p className="kc-note">&ldquo;{first.note}&rdquo;</p>}
        <p className="kc-figures figure">
          costs {m.money(first.cost)} · sells {m.money(first.price)} · target{' '}
          {first.target === null ? '—' : `${first.target.toFixed(0)}%`}
        </p>
        <div className="kc-actions">
          <Link href={`/recipes/${first.recipeId}`} className="btn btn-primary">
            Open the cost sheet
          </Link>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => start(async () => { await markSeen(first.id); })}
          >
            Mark seen
          </button>
        </div>
      </article>

      {rest.map((f) => (
        <article className="kc-more" key={f.id}>
          <span>
            {f.dish} is at{' '}
            <b className="figure">{f.foodCost === null ? '—' : `${f.foodCost.toFixed(0)}%`}</b> ·{' '}
            {whenSent(f.sentAt, today)} · {f.note === null ? 'no note' : 'with a note'}
          </span>
          <Link href={`/recipes/${f.recipeId}`} className="link link-sm">Open</Link>
        </article>
      ))}
    </section>
  );
}

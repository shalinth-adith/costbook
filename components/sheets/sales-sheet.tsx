'use client';

import { useMemo, useState } from 'react';

import type { Recipe } from '@/core/recipe';
import { parseSales } from '@/lib/sales-paste';

import { Sheet } from '../sheet';

/**
 * Last month's sales, pasted.
 *
 * Two columns from the till or the aggregator's dashboard: the dish and how
 * many sold. The count of matched lines updates as you paste, and every line
 * that matches no dish is named, so nothing is saved on a guess.
 */
export function SalesSheet({
  open,
  onClose,
  periodSaid,
  period,
  periods,
  onPeriod,
  recipes,
  busy,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  periodSaid: string;
  /** The month being recorded, as `YYYY-MM`. */
  period: string;
  /** The months a person can choose between: this one and the year behind it. */
  periods: readonly { readonly id: string; readonly said: string }[];
  onPeriod: (period: string) => void;
  recipes: readonly Recipe[];
  busy: boolean;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const lines = useMemo(() => parseSales(text, recipes), [text, recipes]);
  const matched = lines.filter((l) => l.recipeId !== null && l.sold !== null);
  const unmatched = lines.filter((l) => l.recipeId === null);
  const noCount = lines.filter((l) => l.recipeId !== null && l.sold === null);

  return (
    <Sheet
      title={`Sales for ${periodSaid}`}
      open={open}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn-primary wide"
          disabled={busy || matched.length === 0}
          onClick={() => onSave(text)}
        >
          {busy ? 'Saving…' : matched.length === 0 ? 'Paste a dish and a number a line' : `Record ${String(matched.length)} ${matched.length === 1 ? 'dish' : 'dishes'}`}
        </button>
      }
    >
      <label className="field sales-month">
        <span className="label">Which month</span>
        {/* The period was fixed to last month, so a kitchen catching up on a
            quarter could record one of the three and no more. */}
        <select
          className="wiz-input"
          value={period}
          onChange={(e) => { onPeriod(e.target.value); }}
        >
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.said}</option>
          ))}
        </select>
      </label>
      <p className="sheet-copy">
        One dish a line, with how many sold: the two columns from your till or the app&rsquo;s
        dashboard, pasted. Names are matched to your dishes; anything that matches nothing is
        named below and left out.
      </p>
      <textarea
        className="nd-paste"
        rows={10}
        spellCheck={false}
        value={text}
        placeholder={'Chicken 65, 412\nMasala Dosa 500\nKoottu 38'}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="sales-read">
        {lines.length === 0 ? (
          <span className="nd-hint">Nothing read yet.</span>
        ) : (
          <>
            <span className="nd-chip is-known">
              {String(matched.length)} {matched.length === 1 ? 'dish' : 'dishes'} with a number
            </span>
            {noCount.length > 0 && (
              <span className="nd-chip is-new">{String(noCount.length)} without a number</span>
            )}
            {unmatched.length > 0 && (
              <span className="nd-chip is-new">{String(unmatched.length)} not a dish of yours</span>
            )}
          </>
        )}
      </div>
      {unmatched.length > 0 && (
        <p className="sheet-foot-note">
          Not matched: {unmatched.slice(0, 6).map((l) => l.name).join(', ')}
          {unmatched.length > 6 ? ` and ${String(unmatched.length - 6)} more` : ''}. Check the
          spelling against your dish list, or leave them out.
        </p>
      )}
    </Sheet>
  );
}

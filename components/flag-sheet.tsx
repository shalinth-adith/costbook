'use client';

import { useState, useTransition } from 'react';

import { raiseFlag } from '@/app/flags/actions';

import { useMoney } from './currency-provider';
import { Sheet } from './sheet';

/**
 * The chef's side of a flag (A40).
 *
 * One tap, then one optional line. The figures go with it — a chef never
 * retypes a number — and the note is for the thing only a person knows.
 * "Mutton went up again on Tuesday" is the whole reason the feature exists.
 */
export function FlagSheet({
  open,
  onClose,
  dish,
  recipeId,
  to,
  cost,
  price,
  foodCost,
  target,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  dish: string;
  recipeId: string;
  /** Named, never "the owner". In a café of four, a role is nobody. */
  to: string;
  cost: number | null;
  price: number | null;
  foodCost: number | null;
  target: number;
  onSent: (message: string) => void;
}) {
  const m = useMoney();
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();

  const send = () => {
    start(async () => {
      const ack = await raiseFlag({ recipeId, note, cost, price, foodCost, target });
      onSent(ack.message);
      setNote('');
      onClose();
    });
  };

  return (
    <Sheet
      title={`Send this to ${to}`}
      open={open}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-primary wide" disabled={pending} onClick={send}>
            {pending ? 'Sending…' : 'Send it'}
          </button>
          <button type="button" className="btn wide" onClick={onClose}>Cancel</button>
        </>
      }
    >
      <p className="sheet-copy">
        {to} will see it next time they open Costbook. Nothing is sent to anyone else.
      </p>

      <div className="flag-dish">
        <p className="flag-dish-name">{dish}</p>
        <p className="flag-dish-figures">
          Costs <b className="figure">{m.withSymbol(cost)}</b>, sells at{' '}
          <b className="figure">{m.withSymbol(price)}</b> — that&rsquo;s{' '}
          <b className="figure">{foodCost === null ? '—' : `${foodCost.toFixed(0)}%`}</b> of the
          price.
        </p>
        <p className="flag-dish-note">The figures go with it. You don&rsquo;t have to write them out.</p>
      </div>

      <label className="field">
        <span className="field-label">Anything to add? Not required.</span>
        <input
          className="set-input"
          value={note}
          placeholder="Mutton went up again on Tuesday"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
    </Sheet>
  );
}

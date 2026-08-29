'use client';

import { useMemo, useState } from 'react';

import type { Ingredient } from '@/core/ingredient';
import { parseTsv } from '@/core/parse';

import { qty } from '@/lib/format';

import { useMoney } from '../currency-provider';

import { Sheet } from '../sheet';

/**
 * Paste rows.
 *
 * Read by `core/parse.ts` — the same code as the file importer, because a
 * paste and an upload meet the same messy data and two code paths would drift
 * (FLOWS 5). Each name is matched against the ingredients on file.
 *
 * A row without a rate still comes in. It lands carrying a Set rate button,
 * and until it has one the dish reports a floor rather than a cost.
 */
export interface PastedRow {
  readonly name: string;
  readonly qty: number;
  readonly unit: string;
  readonly rate: number | null;
  readonly match: Ingredient | null;
}

const SAMPLE = [
  'Sesame oil, gingelly\t10\tg\t280.00',
  'Mustard seed\t2\tg\t190.00',
  'Urad dal, split\t3\tg\t160.00',
  'Asafoetida, compounded\t1\tg',
].join('\n');

export function PasteSheet({
  open,
  onClose,
  shelf,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  shelf: readonly Ingredient[];
  onAdd: (rows: readonly PastedRow[]) => void;
}) {
  const [text, setText] = useState('');
  const m = useMoney();

  const rows = useMemo<readonly PastedRow[]>(() => {
    if (text.trim() === '') return [];

    // A pasted block usually has no header, so the columns are named for it.
    const parsed = parseTsv(`Ingredient\tQty\tUnit\tRate\n${text}`);
    const byName = new Map(shelf.map((i) => [i.name.toLowerCase(), i]));

    return parsed.blocks
      .flatMap((b) => b.lines)
      .map((line) => ({
        name: line.name,
        qty: line.qty ?? 1,
        unit: line.rawUnit ?? '',
        rate: line.rate,
        match: byName.get(line.name.toLowerCase()) ?? null,
      }));
  }, [text, shelf]);

  const matched = rows.filter((r) => r.match !== null).length;
  const unpriced = rows.filter((r) => r.rate === null && r.match?.purchasePrice == null).length;

  return (
    <Sheet
      title="Paste rows from your sheet"
      open={open}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={rows.length === 0}
            onClick={() => { onAdd(rows); setText(''); }}
          >
            {rows.length === 0 ? 'Nothing to add yet' : `Add ${rows.length === 1 ? 'this line' : `these ${rows.length} lines`}`}
          </button>
        </>
      }
    >
      <p className="sheet-copy">
        Copy the rows out of your own sheet and paste them here. Costbook reads name, quantity,
        unit and rate in whatever order they arrive, and matches each name against your
        ingredients.
      </p>

      <textarea
        className="paste-box figure"
        value={text}
        rows={6}
        spellCheck={false}
        placeholder={SAMPLE}
        aria-label="Rows pasted from a spreadsheet"
        onChange={(e) => setText(e.target.value)}
      />

      {rows.length === 0 ? (
        <button type="button" className="link" onClick={() => setText(SAMPLE)}>
          Paste an example, to see what happens
        </button>
      ) : (
        <>
          <div className="paste-count">
            <span className="figure strong">{rows.length}</span> rows read ·{' '}
            <span className="figure">{matched}</span> matched
            {unpriced > 0 ? <> · <span className="figure warn-ink">{unpriced}</span> with no rate</> : null}
          </div>

          <ul className="paste-rows">
            {rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className={r.rate === null && r.match?.purchasePrice == null ? 'is-missing' : ''}>
                <span className="paste-name">{r.name}</span>
                <span className="figure paste-qty">{qty(r.qty)} {r.unit}</span>
                <span className="figure paste-rate">
                  {r.rate === null ? 'no rate' : m.money(r.rate)}
                </span>
                <span className="paste-match">{r.match === null ? 'new ingredient' : 'matched'}</span>
              </li>
            ))}
          </ul>

          {unpriced > 0 ? (
            <p className="sheet-foot-note">
              The row without a rate still comes in. It sits in the list carrying a Set rate
              button, and until you give it one the total below is a floor rather than a cost.
            </p>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

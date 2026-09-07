'use client';

import { useMemo, useState } from 'react';

import type { Recipe } from '@/core/recipe';
import { parseSales, salesTextFromGrid } from '@/lib/sales-paste';


/**
 * Last month's sales, pasted.
 *
 * Two columns from the till or the aggregator's dashboard: the dish and how
 * many sold. The count of matched lines updates as you paste, and every line
 * that matches no dish is named, so nothing is saved on a guess.
 */
export function SalesSheet({
  onClose,
  period,
  periods,
  onPeriod,
  recipes,
  busy,
  onSave,
}: {
  onClose: () => void;
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
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const lines = useMemo(() => parseSales(text, recipes), [text, recipes]);

  /*
   * A file is turned into the lines the paste box takes and put in the box.
   *
   * One reader for both doors: what a file matches and what it names as
   * unmatched is exactly what a paste of the same lines would. The operator
   * can also see what was read and fix a line by hand before recording.
   */
  async function read(file: File) {
    setFileProblem(null);
    try {
      const XLSX = await import('xlsx');
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const first = book.SheetNames[0];
      const sheet = first === undefined ? undefined : book.Sheets[first];
      if (sheet === undefined) throw new Error('empty');
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      const got = salesTextFromGrid(grid);
      if (got === '') {
        setFileProblem('Nothing in that file had a dish name beside a number.');
        return;
      }
      setText(got);
      setFileName(file.name);
    } catch {
      setFileProblem(
        'Costbook could not read that. It takes .xlsx and .csv — export the till report as one of those.',
      );
    }
  }
  const matched = lines.filter((l) => l.recipeId !== null && l.sold !== null);
  const unmatched = lines.filter((l) => l.recipeId === null);
  const noCount = lines.filter((l) => l.recipeId !== null && l.sold === null);

  /*
   * A panel under the button, not a drawer from the edge.
   *
   * It opened as a sheet on the right, a screen away from the section that
   * asked for it, and led with a paragraph on what to paste. The placeholder
   * shows the shape; the read-out under the box says what was understood.
   */
  return (
    <div className="sales-panel">
      {/* The month, said as the sentence the panel is. */}
      <div className="sp-head">
        <label className="sp-month">
          <span className="sp-month-said">Record sales for</span>
          {/* The period was fixed to last month, so a kitchen catching up on a
              quarter could record one of the three and no more. */}
          <select
            className="sp-select"
            value={period}
            onChange={(e) => { onPeriod(e.target.value); }}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.said}</option>
            ))}
          </select>
        </label>
        <button type="button" className="link sp-close" disabled={busy} onClick={onClose}>
          Close
        </button>
      </div>

      {/* Two doors, side by side, because they are alternatives rather than
          steps. The file lands in the box on the left, so whichever door was
          used the operator sees and can correct the same lines. */}
      <div className="sp-doors">
        <label className="sp-door sp-door-paste">
          <span className="sp-label">Paste from your till</span>
          <textarea
            className="sp-text"
            rows={7}
            spellCheck={false}
            value={text}
            placeholder={'Chicken 65, 412\nMasala Dosa 500\nKoottu 38'}
            onChange={(e) => setText(e.target.value)}
          />
        </label>

        <div className="sp-door sp-door-file">
          <span className="sp-label">Or open the file itself</span>
          <label
            className={`sp-drop${dragging ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => { setDragging(false); }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f !== undefined) void read(f);
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f !== undefined) void read(f);
                e.target.value = '';
              }}
            />
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4m0 0L8 8m4-4 4 4" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            <span className="sp-drop-say">Drop it here, or choose a file</span>
            <span className="sp-drop-formats figure">.xlsx · .xls · .csv</span>
          </label>
          {fileProblem !== null ? (
            <p className="sp-file-problem">{fileProblem}</p>
          ) : fileName !== null ? (
            <p className="sp-file-name">
              <b className="figure">{fileName}</b> — read into the box beside this. Fix any
              line there before recording.
            </p>
          ) : (
            <p className="sp-file-hint">
              The name is the first thing on a row and the count the last number on it. What it
              reads lands in the box beside this, so you can check it.
            </p>
          )}
        </div>
      </div>

      {/* What was understood, and the one action, on one line. */}
      <div className="sp-foot">
        <div className="sp-read">
          {lines.length === 0 ? (
            <span className="sp-hint">Nothing read yet.</span>
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
              {unmatched.length > 0 && (
                <span className="sp-unmatched">
                  {unmatched.slice(0, 4).map((l) => l.name).join(', ')}
                  {unmatched.length > 4 ? ` and ${String(unmatched.length - 4)} more` : ''}
                </span>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary sp-record"
          disabled={busy || matched.length === 0}
          onClick={() => onSave(text)}
        >
          {busy
            ? 'Saving…'
            : matched.length === 0
              ? 'Record'
              : `Record ${String(matched.length)} ${matched.length === 1 ? 'dish' : 'dishes'}`}
        </button>
      </div>
    </div>
  );
}

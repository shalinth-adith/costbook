'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Ingredient } from '@/core/ingredient';
import { type ColumnMapping, type Field, parseRows } from '@/core/parse';

import { type ImportPlan, groupWarnings, planImport } from '@/lib/import';
import { qty } from '@/lib/format';

import { useMoney } from './currency-provider';

type Step = 'upload' | 'map' | 'warnings' | 'done';

const FIELDS: readonly { value: Field | 'ignore'; label: string }[] = [
  { value: 'name', label: 'Ingredient name' },
  { value: 'qty', label: 'Quantity' },
  { value: 'unit', label: 'Unit' },
  { value: 'rate', label: 'Rate per unit' },
  { value: 'total', label: 'Line total' },
  { value: 'yield', label: 'Yield %' },
  { value: 'ignore', label: 'Do not import' },
];

const STEPS: readonly { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'map', label: 'Map columns' },
  { key: 'warnings', label: 'Review warnings' },
  { key: 'done', label: 'Commit' },
];

/**
 * The import wizard. Upload, map, review, commit (FLOWS 3).
 *
 * The file is read in the browser and never uploaded. That is not only a
 * privacy nicety - it is what lets the screen say, truthfully, that the sheet
 * is read and never altered, which is the first anxiety anyone brings here.
 *
 * Nothing is written until the last step, and the summary shown before it is
 * computed from the same plan that performs it.
 */
export function ImportWizard({
  existing,
  knownRecipes,
  onCommit,
}: {
  existing: readonly Ingredient[];
  knownRecipes: readonly string[];
  onCommit: (plan: ImportPlan) => Promise<{ message: string; undoable: boolean }>;
}) {
  const m = useMoney();
  const router = useRouter();
  const fileField = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [rows, setRows] = useState<readonly (readonly string[])[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const parsed = useMemo(
    () =>
      rows.length === 0
        ? null
        : parseRows(rows, { mapping, knownRecipes }),
    [rows, mapping, knownRecipes],
  );

  const plan = useMemo(
    () => (parsed === null ? null : planImport(parsed, existing, new Date().toISOString().slice(0, 10))),
    [parsed, existing],
  );

  const warnings = useMemo(() => (parsed === null ? [] : groupWarnings(parsed)), [parsed]);
  const header = parsed?.headerRow === null || parsed === null ? [] : (rows[parsed.headerRow] ?? []);

  async function read(file: File) {
    setBusy(true);
    setProblem(null);
    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const book = XLSX.read(data, { type: 'array' });

      const first = book.SheetNames[0];
      const sheet = first === undefined ? undefined : book.Sheets[first];
      if (first === undefined || sheet === undefined) {
        setProblem('That file has no sheets in it.');
        return;
      }

      const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
      });

      setFileName(file.name);
      setSheetName(first);
      setRows(grid.map((r) => r.map((c) => String(c ?? ''))));
      // Detection runs first; the operator corrects it on the next step.
      setMapping(parseRows(grid.map((r) => r.map((c) => String(c ?? ''))), {}).mapping);
      setStep('map');
    } catch {
      setProblem(
        'Costbook could not read that. It takes .xlsx and .csv — if yours is something else, ' +
          'export it as one of those and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const setField = (column: number, field: Field | 'ignore') => {
    setMapping((current) => {
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(current)) {
        if (v !== column) next[k] = v;
      }
      if (field !== 'ignore') next[field] = column;
      return next as ColumnMapping;
    });
  };

  const fieldFor = (column: number): Field | 'ignore' => {
    const hit = Object.entries(mapping).find(([, v]) => v === column);
    return (hit?.[0] as Field | undefined) ?? 'ignore';
  };

  const commit = () => {
    if (plan === null) return;
    setBusy(true);
    void onCommit(plan)
      .then((ack) => {
        setResult(ack.message);
        setStep('done');
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1 className="page-title">Import ingredients</h1>
          <p className="page-sub">
            {fileName === ''
              ? 'Bring in the sheet you already keep. Costbook reads it and never alters it.'
              : `${fileName} · sheet ${sheetName} · ${rows.length} rows`}
          </p>
        </div>
      </div>

      <ol className="steps">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={`step${s.key === step ? ' is-now' : ''}${STEPS.findIndex((x) => x.key === step) > i ? ' is-done' : ''}`}
          >
            <span className="figure step-n">{i + 1}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="import-wrap">
        {step === 'upload' ? (
          <section className="card empty">
            <p className="empty-title">Choose your sheet</p>
            <p className="empty-copy">
              An .xlsx or a .csv. Costbook reads the file and never writes to it — nothing on your
              machine changes, and you can throw the import away afterwards.
            </p>
            <div className="empty-actions">
              <input
                ref={fileField}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="visually-hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file !== undefined) void read(file);
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => fileField.current?.click()}
              >
                {busy ? 'Reading…' : 'Choose a file'}
              </button>
            </div>
            {problem === null ? null : <p className="empty-copy warn-ink">{problem}</p>}
          </section>
        ) : null}

        {step === 'map' && parsed !== null ? (
          <div className="map-grid">
            {/* Their sheet stays visible throughout. Nothing is asked twice. */}
            <section className="card sheet-preview">
              <div className="card-head"><h2 className="card-title">Your sheet</h2></div>
              <div className="preview-scroll">
                <table className="preview">
                  <tbody>
                    {rows.slice(0, 12).map((r, i) => (
                      <tr key={i} className={i === parsed.headerRow ? 'is-header' : ''}>
                        <td className="figure preview-n">{i + 1}</td>
                        {r.slice(0, 8).map((c, j) => <td key={j}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2 className="card-title">
                  We recognised {Object.keys(mapping).length} of your {header.length} columns
                </h2>
              </div>
              <p className="sheet-copy map-copy">
                Check anything we were unsure about and change what we got wrong. Your file is not
                altered — Costbook only reads it.
              </p>

              <div className="map-list">
                {header.map((h, i) => (
                  <div key={i} className="map-row">
                    <span className="map-head">
                      <span className="map-head-name">{h === '' ? `Column ${i + 1}` : h}</span>
                      <span className="map-sample">
                        e.g. {rows[(parsed.headerRow ?? 0) + 1]?.[i] ?? '—'}
                      </span>
                    </span>
                    <select
                      className="rule-select field-select map-select"
                      value={fieldFor(i)}
                      aria-label={`What column ${i + 1} holds`}
                      onChange={(e) => setField(i, e.target.value as Field | 'ignore')}
                    >
                      {FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="wizard-foot">
                <button type="button" className="btn" onClick={() => setStep('upload')}>Back</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={mapping.name === undefined}
                  onClick={() => setStep('warnings')}
                >
                  {mapping.name === undefined ? 'Point at the name column' : 'Continue to warnings'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {step === 'warnings' && plan !== null ? (
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">
                {plan.ingredients.length} ingredients read.{' '}
                {warnings.length === 0 ? 'Nothing to look at.' : `${warnings.length} things to look at.`}
              </h2>
            </div>

            <p className="sheet-copy map-copy">
              None of these are mistakes on your part — spreadsheets kept by hand always carry a
              few. They are counted and sorted by consequence, and you can leave every one of them
              and fix it later.
            </p>

            <div className="warn-list">
              {warnings.map((w) => (
                <details key={w.code} className={`warn warn-${w.tone}`}>
                  <summary>
                    <span className="warn-title">{w.title}</span>
                    {w.tone === 'block' ? <span className="chip chip-over">BLOCKS ONE DISH</span> : null}
                  </summary>
                  <p className="warn-body">{w.body}</p>
                  <ul className="warn-items">
                    {w.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                </details>
              ))}
            </div>

            <div className="arrivals">
              <Arrival label="Ingredients, new" value={plan.summary.ingredientsNew} />
              <Arrival label="Rates updated" value={plan.summary.ratesUpdated} />
              <Arrival label="Dishes created" value={plan.summary.dishes} />
              <Arrival label="Rows skipped" value={plan.summary.rowsSkipped} />
            </div>

            <div className="wizard-foot">
              <button type="button" className="btn" onClick={() => setStep('map')}>Back to mapping</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={commit}>
                {busy ? 'Committing…' : 'Commit the import'}
              </button>
            </div>
          </section>
        ) : null}

        {step === 'done' ? (
          <section className="card empty">
            <p className="empty-title">Brought in</p>
            <p className="empty-copy">{result}</p>
            <div className="empty-actions">
              <button type="button" className="btn btn-primary" onClick={() => router.push('/recipes')}>
                See your recipes
              </button>
              <button type="button" className="btn" onClick={() => router.push('/ingredients')}>
                See your ingredients
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function Arrival({ label, value }: { label: string; value: number }) {
  return (
    <div className="arrival">
      <span className="label">{label}</span>
      <span className="figure arrival-value">{qty(value)}</span>
    </div>
  );
}

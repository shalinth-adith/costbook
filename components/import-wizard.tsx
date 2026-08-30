'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Ingredient } from '@/core/ingredient';
import {
  type ColumnMapping,
  type Field,
  NEEDED_FIELDS,
  missingFields,
  parseRows,
  readRow,
  sampleRows,
  currencyFromHeader,
} from '@/core/parse';

import { type ImportPlan, groupWarnings, looksLikeMappingError, planImport } from '@/lib/import';
import { qty } from '@/lib/format';

import { Sheet } from './sheet';
import { useMoney } from './currency-provider';

type Step = 'upload' | 'map' | 'warnings' | 'done';

const FIELDS: readonly { value: Field | 'ignore'; label: string }[] = [
  { value: 'recipe', label: 'Recipe name' },
  { value: 'section', label: 'Section' },
  { value: 'name', label: 'Ingredient name' },
  { value: 'qty', label: 'Quantity' },
  { value: 'unit', label: 'Unit' },
  { value: 'rate', label: 'Rate per unit' },
  { value: 'total', label: 'Line total' },
  { value: 'yield', label: 'Yield %' },
  // Not a default. Anything left unplaced arrives as a field on the
  // ingredient rather than being thrown away (A6).
  { value: 'ignore', label: 'Keep as a custom field' },
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
  currencyCode,
  onUseCurrency,
}: {
  existing: readonly Ingredient[];
  knownRecipes: readonly string[];
  /** What the account prices in, so a sheet in another currency can say so. */
  currencyCode: string;
  /** Adopt the sheet's currency. Only offered while nothing is costed. */
  onUseCurrency?: ((code: string) => Promise<unknown>) | undefined;
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
  /** Formula cells whose results the file does not carry. */
  const [uncomputed, setUncomputed] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  /** Which sample row the preview is reading back. */
  const [sample, setSample] = useState(0);
  /** The confirmation drawer: what would land, before it lands. */
  const [checking, setChecking] = useState(false);

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

  const lineCount = useMemo(
    () => (parsed === null ? 0 : parsed.blocks.reduce((n, b) => n + b.lines.length, 0)),
    [parsed],
  );
  const warnings = useMemo(
    () => (parsed === null ? [] : groupWarnings(parsed, lineCount)),
    [parsed, lineCount],
  );
  const mappingFault = useMemo(() => looksLikeMappingError(warnings), [warnings]);

  /** Read off the sheet's own headings — "Price (AED)" says what it is in. */
  const detectedCurrency = useMemo(() => {
    if (parsed === null) return null;
    const header = parsed.headerRow === null ? [] : (rows[parsed.headerRow] ?? []);
    return currencyFromHeader(header);
  }, [parsed, rows]);

  const samples = useMemo(
    () => (parsed === null ? [] : sampleRows(rows, mapping, parsed.headerRow)),
    [rows, mapping, parsed],
  );
  const reading = useMemo(() => {
    const at = samples[sample % Math.max(1, samples.length)];
    return at === undefined ? null : readRow(rows, at, mapping);
  }, [rows, mapping, samples, sample]);

  const missing = useMemo(() => missingFields(mapping), [mapping]);
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

      /*
       * A formula with no cached result is not an empty cell.
       *
       * Some exports write the formula and not the figure it produced —
       * Google Sheets does this, and so does anything that never opened the
       * file in a spreadsheet. SheetJS reads the cached value, so those cells
       * arrive blank, and a whole column of prices vanishes without a word.
       *
       * The same workbook exported the other way imports perfectly, which is
       * why this is worth naming rather than treating as an empty sheet.
       */
      let formulaCells = 0;
      let emptyFormulaCells = 0;
      for (const [ref, cell] of Object.entries(sheet)) {
        if (ref.startsWith('!')) continue;
        const c = cell as { f?: string; v?: unknown };
        if (c.f === undefined) continue;
        formulaCells += 1;
        if (c.v === undefined || c.v === null || c.v === '') emptyFormulaCells += 1;
      }
      setUncomputed(
        formulaCells > 0 && emptyFormulaCells / formulaCells > 0.5 ? emptyFormulaCells : 0,
      );

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

      {/* What would land, before it lands. Not a page to navigate to - the
          recipe of the moment is this import, and leaving it to go and look at
          the ingredients list would lose the thing being decided (A6, A7b). */}
      <Sheet
        title="What would arrive"
        open={checking && plan !== null}
        onClose={() => setChecking(false)}
        footer={
          plan === null ? null : (
            <>
              <button type="button" className="btn" onClick={() => setChecking(false)}>
                Not yet
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={commit}>
                {busy
                  ? 'Committing…'
                  : `Yes, bring in ${plan.ingredients.length} ingredients and ${plan.recipes.length} dishes`}
              </button>
            </>
          )
        }
      >
        {plan === null ? null : (
          <>

            <p className="sheet-copy map-copy">
              Nothing has been written yet. This is every figure that would land, taken from your
              sheet — read the rates before you agree to them, because a wrong rate is harder to
              notice later than a missing one.
              {plan.summary.unpriced > 0 ? (
                <>
                  {' '}
                  <strong>
                    {plan.summary.unpriced} arrive with no rate
                  </strong>{' '}
                  because the rows they came from could not be trusted. They are listed first.
                </>
              ) : null}
            </p>

            <div className="check-head">
              <span>Ingredient</span>
              <span>From your sheet</span>
              <span className="end">Rate that would be set</span>
              <span>What happens</span>
            </div>

            <div className="check-scroll">
              {[...plan.ingredients]
                .sort((a, b) => Number(b.suspect) - Number(a.suspect))
                .map((p) => (
                  <div
                    key={p.ingredient.id}
                    className={`check-row${p.suspect ? ' is-suspect' : ''}`}
                  >
                    <span className="check-name">{p.ingredient.name}</span>
                    <span className="check-source figure">
                      {p.sourceQty === null ? '—' : `${qty(p.sourceQty)} ${p.sourceUnit ?? ''}`}
                      <span className="check-rowno"> · row {p.sourceRow + 1}</span>
                    </span>
                    <span className="figure end check-rate">
                      {p.ingredient.purchasePrice === null
                        ? 'no rate'
                        : `${m.withSymbol(rateFor(p))} / ${p.ingredient.purchaseUnit}`}
                    </span>
                    <span className="check-what">
                      {p.suspect ? (
                        <span className="warn-ink">Unpriced — {p.suspectWhy}</span>
                      ) : p.existing ? (
                        <>
                          Updates the one you have
                          {p.wasRate === null ? '' : ''}
                        </>
                      ) : (
                        'New ingredient'
                      )}
                    </span>
                  </div>
                ))}
            </div>

            <div className="card-head check-recipes-head">
              <h2 className="card-title">
                Dishes it would create <span className="figure card-count">{plan.recipes.length}</span>
              </h2>
            </div>
            <div className="check-scroll">
              {plan.recipes.map((r) => (
                <div key={r.recipe.id} className="check-row is-recipe">
                  <span className="check-name">{r.recipe.name}</span>
                  <span className="check-source figure">
                    {r.recipe.components.length} lines
                  </span>
                  <span className="figure end check-rate" />
                  <span className="check-what">
                    {r.skipped === 0 ? 'Every line read' : `${r.skipped} rows left out`}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Sheet>

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
            {/* Stated before anything is mapped, because a column that arrived
                empty cannot be mapped to anything and the operator would spend
                the screen wondering why. */}
            {uncomputed > 0 ? (
              <div className="import-alarm" role="alert">
                <p className="import-alarm-title">
                  This file carries its formulas but not their answers.
                </p>
                <p className="import-alarm-copy">
                  <b className="figure">{uncomputed}</b> cells hold a formula with no result saved
                  alongside it, so Costbook reads them as blank — most likely your price, output and
                  selling-price columns. It is how some exports write a spreadsheet; nothing is
                  wrong with your figures.
                </p>
                <p className="import-alarm-copy">
                  Open the file in Excel, Numbers or Google Sheets and save it again, and the
                  answers travel with it. Import that copy instead.
                </p>
              </div>
            ) : null}

            {detectedCurrency !== null && detectedCurrency !== currencyCode ? (
              <div className="import-note">
                <p className="import-alarm-title">
                  This sheet prices in {detectedCurrency}, and your account is set to {currencyCode}.
                </p>
                <p className="import-alarm-copy">
                  Costbook does not convert. Importing as it stands would file{' '}
                  {detectedCurrency} figures under a {currencyCode} symbol, and every price it
                  suggests would be wrong by the exchange rate.
                </p>
                <button type="button" className="btn" onClick={() => void onUseCurrency?.(detectedCurrency)}>
                  Price this account in {detectedCurrency}
                </button>
              </div>
            ) : null}
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
                Nothing we cannot place is thrown away — it arrives as a field on the ingredient.
                Your file is not altered, Costbook only reads it. Read the sentence below before
                you continue; nothing here stops you.
              </p>

              <div className="map-list">
                {header.map((h, i) => (
                  <div key={i} className="map-row">
                    <span className="map-head">
                      <span className="map-head-name">
                        {h === '' ? `Column ${i + 1}` : h}
                        {NEEDED_FIELDS.includes(fieldFor(i) as never) ? (
                          <span className="needed">NEEDED</span>
                        ) : null}
                      </span>
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

              {/* Nobody checks a dropdown. A chef cannot tell whether Price
                  went to Rate per unit or to Line total by reading the labels;
                  read back as a sentence against the sheet's own total, the
                  same mistake is obvious (A6). */}
              <div className="reading">
                <div className="reading-head">
                  <span className="label">How a row will be read</span>
                  {samples.length > 1 ? (
                    <span className="reading-step">
                      <button
                        type="button"
                        className="btn-row"
                        onClick={() => setSample((n) => (n - 1 + samples.length) % samples.length)}
                      >
                        Previous row
                      </button>
                      <span className="figure reading-of">
                        row {(reading?.row ?? 0) + 1} of {rows.length}
                      </span>
                      <button
                        type="button"
                        className="btn-row"
                        onClick={() => setSample((n) => (n + 1) % samples.length)}
                      >
                        Next row
                      </button>
                    </span>
                  ) : null}
                </div>

                {reading === null ? (
                  <p className="reading-said">
                    Point at the ingredient name and the quantity, and one real row from your sheet
                    is read back here.
                  </p>
                ) : (
                  <>
                    <p className="figure reading-sentence">
                      {reading.name} — {qty(reading.qty ?? 0)} {reading.unit} at{' '}
                      {m.withSymbol(reading.rate)} per {reading.unit} ={' '}
                      {m.withSymbol(reading.lineTotal)}
                    </p>
                    <p className="reading-where">
                      Recipe: {reading.recipe ?? <span className="warn-ink">nothing</span>}
                      {reading.section === null ? '' : ` · Section: ${reading.section}`}
                    </p>

                    {reading.sheetTotal === null ? null : reading.agrees ? (
                      <p className="reading-ok">
                        Agrees with the sheet's own line total for this row,{' '}
                        <span className="figure">{m.withSymbol(reading.sheetTotal)}</span>.
                        Quantity and rate are the right way round.
                      </p>
                    ) : (
                      <p className="reading-off">
                        <strong>
                          {reading.reversed
                            ? 'The rate and the line total are the wrong way round.'
                            : 'This does not agree with the sheet.'}
                        </strong>{' '}
                        The sheet's own total for this row is{' '}
                        <span className="figure">{m.withSymbol(reading.sheetTotal)}</span>. Read
                        this way it comes to{' '}
                        <span className="figure">{m.withSymbol(reading.lineTotal)}</span>
                        {reading.factor === null
                          ? '.'
                          : ` — off by a factor of ${Math.abs(reading.factor).toFixed(1)}.`}{' '}
                        Rate per unit belongs on the rate column.
                      </p>
                    )}
                  </>
                )}

                {missing.length > 0 ? (
                  <p className="reading-off">
                    <strong>A needed column is not mapped.</strong>{' '}
                    {missing.includes('recipe')
                      ? `Recipe name is unmapped, so every row arrives as an ingredient and no dish is made from it. All ${rows.length} rows would land as ingredients and 0 dishes.`
                      : `${missing.join(', ')} still to place.`}
                  </p>
                ) : null}
              </div>

              <div className="wizard-foot">
                <button type="button" className="btn" onClick={() => setStep('upload')}>Back</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={mapping.name === undefined}
                  onClick={() => setStep('warnings')}
                >
                  {mapping.name === undefined
                    ? 'Point at the ingredient name column'
                    : 'Continue to warnings'}
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {step === 'warnings' && plan !== null ? (
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">
                {mappingFault === null
                  ? `${plan.ingredients.length} ingredients read. ${
                      warnings.length === 0 ? 'Nothing to look at.' : `${warnings.length} things to look at.`
                    }`
                  : `${lineCount} rows read. One of these is not housekeeping.`}
              </h2>
            </div>

            <p className="sheet-copy map-copy">
              {mappingFault === null
                ? 'None of these are mistakes on your part — spreadsheets kept by hand always carry a few. They are counted and sorted by consequence, and you can leave every one of them and fix it later.'
                : 'The others below are the usual few, and you can leave them and fix them later. The first one is large enough that it is probably not about your sheet at all.'}
            </p>

            <div className="warn-list">
              {warnings.map((w) => (
                <details key={w.code} className={`warn warn-${w.tone}`}>
                  <summary>
                    <span className="warn-title">{w.title}</span>
                    {w.likelyMapping ? (
                      <span className="chip chip-over">LIKELY A MAPPING ERROR, NOT A SHEET ERROR</span>
                    ) : null}
                  </summary>
                  {w.likelyMapping ? (
                    <p className="warn-body">
                      <strong>
                        {w.count} of {lineCount} rows disagree with their unit.
                      </strong>{' '}
                      That is {Math.round(w.share * 100)}% of the sheet, and this many usually means
                      a column is mapped to the wrong field rather than a problem with your sheet.
                      The row preview at the mapping step shows it in one sentence, and two clicks
                      there fixes them all.
                    </p>
                  ) : (
                    <p className="warn-body">{w.body}</p>
                  )}
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
              {mappingFault === null ? (
                <>
                  <button type="button" className="btn" onClick={() => setStep('map')}>
                    Back to mapping
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setChecking(true)}>
                    See what would arrive
                  </button>
                </>
              ) : (
                <>
                  {/* Commit stays, one step to the left. The operator may be
                      right, and blocking them outright would be a worse
                      mistake than the one being prevented (A7b). */}
                  <button type="button" className="btn" onClick={() => setChecking(true)}>
                    Commit as mapped
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setStep('map')}>
                    Back to mapping
                  </button>
                </>
              )}
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
              <button
                type="button"
                className="btn"
                onClick={() => { setStep('upload'); setRows([]); setFileName(''); setResult(null); }}
              >
                Import another sheet
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

/** What one unit would cost, read back in the unit the sheet used. */
function rateFor(p: { ingredient: { purchasePrice: number | null; purchaseQty: number } }): number | null {
  if (p.ingredient.purchasePrice === null) return null;
  return p.ingredient.purchasePrice;
}

function Arrival({ label, value }: { label: string; value: number }) {
  return (
    <div className="arrival">
      <span className="label">{label}</span>
      <span className="figure arrival-value">{qty(value)}</span>
    </div>
  );
}

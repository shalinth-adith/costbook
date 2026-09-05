'use client';

import { perItemRowsFrom } from '@/core/formula-hints';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Ingredient } from '@/core/ingredient';
import type { Recipe } from '@/core/recipe';
import {
  type ColumnMapping,
  type Field,
  NEEDED_FIELDS,
  missingFields,
  parseRows,
  readRow,
  sampleRows,
  currencyFromHeader,
  targetFromSheet,
  type RowEdit,
} from '@/core/parse';
import { suspectUnits } from '@/core/units-suspect';

import { type ImportPlan, flaggedRows, groupWarnings, looksLikeMappingError, planImport } from '@/lib/import';
import { qty } from '@/lib/format';

import { Sheet } from './sheet';
import { useMoney } from './currency-provider';

/*
 * A37 inverts the default path. Everything comes in, then one question a chef
 * can answer: is this how your sheet reads? The mapping panel is demoted
 * behind "No, let me set the columns", not deleted — and a sheet missing
 * something Costbook cannot guess goes there directly, because there is no
 * sentence to read back without a rate or a unit.
 */
type Step = 'upload' | 'confirm' | 'map' | 'warnings' | 'done';

/*
 * Every place a column can go, grouped the way an operator thinks about their
 * sheet rather than the way the engine stores it.
 *
 * The labels say what the column is FOR, not what Costbook calls it — "how
 * many portions one batch makes" rather than "portions" — because the question
 * on this screen is which of their columns means that, and a one-word label
 * makes them guess. The sheet's own heading stays beside it, unaltered.
 */
const FIELDS: readonly { value: Field | 'ignore'; label: string; group: string }[] = [
  { value: 'recipe', label: 'Recipe name — the dish this row belongs to', group: 'What the row is' },
  { value: 'section', label: 'Menu section or category', group: 'What the row is' },
  { value: 'name', label: 'Ingredient name', group: 'What the row is' },

  { value: 'qty', label: 'Quantity used in the recipe', group: 'How much, and what it costs' },
  { value: 'unit', label: 'Unit — kg, g, l, ml, nos', group: 'How much, and what it costs' },
  { value: 'rate', label: 'Rate per unit — what one kg or one litre costs', group: 'How much, and what it costs' },
  { value: 'total', label: 'Line total — quantity times rate', group: 'How much, and what it costs' },
  { value: 'yield', label: 'Yield % — how much survives peeling and trimming', group: 'How much, and what it costs' },

  { value: 'portions', label: 'Portions per batch — how many plates it serves', group: 'About the batch' },
  { value: 'output', label: 'Batch output — what one batch weighs or yields', group: 'About the batch' },
  { value: 'sellingPrice', label: 'Selling price — what the dish sells for', group: 'About the batch' },
  { value: 'method', label: 'Preparation method — prints on the prep card', group: 'About the batch' },

  // Not a default. Anything left unplaced arrives as a field on the
  // ingredient rather than being thrown away (A6).
  { value: 'ignore', label: 'Keep as it is, under its own name', group: 'Keep, do not cost' },
];

/** The groups, in the order they appear, without repeating any. */
const FIELD_GROUPS: readonly string[] = [...new Set(FIELDS.map((f) => f.group))];

/*
 * Two steps, not four. A37: "Your file · Did we read it right? · Your menu".
 * Mapping is not a step any more — it is a door off the second one, and most
 * people never open it.
 */
const STEPS: readonly { key: Step; label: string }[] = [
  { key: 'upload', label: 'Your file' },
  { key: 'confirm', label: 'Did we read it right?' },
  { key: 'done', label: 'Your menu' },
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
  existingRecipes,
  knownRecipes,
  onCommit,
  currencyCode,
  onUseCurrency,
  targetPercent,
  onUseTarget,
}: {
  existing: readonly Ingredient[];
  /** Dishes already in the book. Named on the sheet, they are linked to, never re-imported. */
  existingRecipes: readonly Recipe[];
  knownRecipes: readonly string[];
  /** What the account prices in, so a sheet in another currency can say so. */
  currencyCode: string;
  /** Adopt the sheet's currency. Only offered while nothing is costed. */
  onUseCurrency?: ((code: string) => Promise<unknown>) | undefined;
  /** The food cost percentage the account prices at today. */
  targetPercent: number;
  /** Adopt the target the sheet itself prices at. */
  onUseTarget?: ((percent: number) => Promise<unknown>) | undefined;
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
  /** Whether a file is being dragged over the target. */
  const [dragging, setDragging] = useState(false);
  /**
   * What to call a column Costbook keeps but does not cost. Defaults to the
   * sheet's own heading, because that is what the operator will look for.
   */
  const [customNames, setCustomNames] = useState<Readonly<Record<number, string>>>({});
  /** Which suspect labels the operator has agreed to read differently. */
  const [rereadUnits, setRereadUnits] = useState<Readonly<Record<string, string>>>({});
  /** Rows the workbook's own formulas add per item (core/formula-hints.ts). */
  const [perPortionRows, setPerPortionRows] = useState<readonly number[]>([]);
  /** Corrections typed on the review screen, by row number. */
  const [rowEdits, setRowEdits] = useState<Readonly<Record<number, RowEdit>>>({});
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
        : parseRows(rows, { mapping, knownRecipes, keepAs: customNames, rereadUnits, rowEdits, perPortionRows }),
    [rows, mapping, knownRecipes, customNames, rereadUnits, rowEdits, perPortionRows],
  );

  const plan = useMemo(
    () => (parsed === null ? null : planImport(parsed, existing, new Date().toISOString().slice(0, 10), existingRecipes)),
    [parsed, existing, existingRecipes],
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

  /** The rows those warnings are actually about, ready to be corrected. */
  const flagged = useMemo(() => (parsed === null ? [] : flaggedRows(parsed)), [parsed]);

  /*
   * Split by whether it stops a dish being costed. A38 counts only the first
   * kind on the card — clear those and it goes, whatever is left in the other
   * group — because 516 is not a number anyone can act on.
   */
  const blocking = useMemo(() => flagged.filter((f) => f.severity === 'stops-costing'), [flagged]);
  const mild = useMemo(() => flagged.length - blocking.length, [flagged, blocking]);

  /**
   * Unit labels the sheet contradicts itself about.
   *
   * Never applied on its own. The operator is shown their own rows and asked,
   * because either answer is possible — a bakery really might weigh saffron in
   * grams — and guessing is what produced a 23,000 plate of rice.
   */
  const suspects = useMemo(() => {
    if (parsed === null) return [];
    return suspectUnits(
      parsed.blocks.flatMap((b) =>
        b.lines.map((l) => ({ row: l.row, qty: l.qty, unit: l.rawUnit })),
      ),
    );
  }, [parsed]);

  /** Read off the sheet's own headings — "Price (AED)" says what it is in. */
  const detectedCurrency = useMemo(() => {
    if (parsed === null) return null;
    const header = parsed.headerRow === null ? [] : (rows[parsed.headerRow] ?? []);
    return currencyFromHeader(header);
  }, [parsed, rows]);

  /**
   * The target the sheet prices at, read off its own cost and price columns.
   *
   * Costbook's default is 32%. The reference workbook divides by 0.2 on every
   * row. Applying ours to theirs tells an operator to drop a price they set on
   * purpose — so where the sheet has stated a target, we ask before ours wins.
   */
  const sheetTarget = useMemo(() => {
    if (parsed === null) return null;
    return targetFromSheet(rows, parsed.headerRow);
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
      const formulas: [string, string][] = [];
      for (const [ref, cell] of Object.entries(sheet)) {
        if (ref.startsWith('!')) continue;
        const c = cell as { f?: string; v?: unknown };
        if (c.f === undefined) continue;
        formulaCells += 1;
        formulas.push([ref, c.f]);
        if (c.v === undefined || c.v === null || c.v === '') emptyFormulaCells += 1;
      }
      // What the formulas say that the values cannot: which lines go on every item.
      setPerPortionRows(perItemRowsFrom(formulas));
      setUncomputed(
        formulaCells > 0 && emptyFormulaCells / formulaCells > 0.5 ? emptyFormulaCells : 0,
      );

      setFileName(file.name);
      setSheetName(first);
      setRows(grid.map((r) => r.map((c) => String(c ?? ''))));
      /*
       * Detection runs first, and decides which question to ask.
       *
       * With everything placed there is a sentence to read back, and reading
       * it is a question a chef can answer. With a rate or a unit missing
       * there is no sentence — the mapping step is not a fallback here, it is
       * the only thing that can be asked.
       */
      const detected = parseRows(grid.map((r) => r.map((c) => String(c ?? ''))), {}).mapping;
      setMapping(detected);
      setStep(missingFields(detected).length === 0 ? 'confirm' : 'map');
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

  /*
   * Commit does not wait on the warnings any more (A38).
   *
   * Nothing on the result screen blocks the menu: a row nobody fixes leaves
   * its dish reporting a floor, which is a true figure and a lower one than
   * the real cost. Holding 1,140 rows hostage to 516 notes about odd units is
   * how an import ends in a spreadsheet again.
   */
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
                        p.ingredient.purchasePrice !== null && p.ingredient.purchasePrice !== p.wasRate
                          ? <>Rate moves{p.wasRate === null ? '' : ` from ${m.withSymbol(p.wasRate)}`}; everything else stays as you have it</>
                          : <>Already on file, kept as it is</>
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
        {/*
          A37 step 1 · the drop.
          
          A file being dragged needs somewhere to land, so the target takes the
          screen — a large target is the feature, not padding. The old version
          was a small card in a corner of a page-sized void, which is the same
          fault A35 names on the empty Recipes screen.
        */}
        {step === 'upload' ? (
          <div className="rx-empty">
            <div className="rx-empty-lead">
              <h1 className="rx-empty-h">Drop your spreadsheet here</h1>
              <p className="rx-empty-lede">
                Everything in it comes in. Nothing is dropped, nothing is guessed, and your file is
                only ever read.
              </p>
            </div>

            <div className="rx-empty-grid">
              <label
                className={`rx-drop is-target${dragging ? ' is-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file !== undefined) void read(file);
                }}
              >
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
                <span className="rx-drop-title">
                  {dragging ? 'Let go' : busy ? 'Reading it…' : 'Drop it anywhere in here'}
                </span>
                <span className="rx-drop-copy">
                  Or choose it from your machine. Merged cells, blank rows, three sheets in one
                  file, prices with the currency typed in — we&rsquo;ve read all of it.
                </span>
                <button
                  type="button"
                  className="btn btn-primary rx-drop-btn"
                  disabled={busy}
                  onClick={() => fileField.current?.click()}
                >
                  {busy ? 'Reading…' : 'Choose a file'}
                </button>
                <span className="rx-drop-formats figure">.xlsx · .xls · .csv</span>
                <span className="rx-drop-trust">Your file is read, never altered</span>
              </label>

              <div className="rx-empty-side">
                {/* A sheet that won't parse. Not a mistake on their part. */}
                {problem === null ? null : (
                  <section className="import-alarm" role="alert">
                    <p className="import-alarm-title">We couldn&rsquo;t open that one.</p>
                    <p className="import-alarm-copy">{problem}</p>
                    <p className="import-alarm-copy">
                      None of this is a mistake on your part, and your file is not altered.
                    </p>
                  </section>
                )}

                <section className="rx-panel">
                  <h2 className="rx-panel-h">Everything comes in</h2>
                  <p className="rx-panel-copy">
                    Columns we can&rsquo;t place are kept under your own headings rather than
                    dropped. Nothing in your sheet is thrown away, and nothing is guessed.
                  </p>
                </section>

                <section className="rx-panel">
                  <h2 className="rx-panel-h">Then one question</h2>
                  <p className="rx-panel-copy">
                    We read one of your own rows back as a sentence. If it reads right, everything
                    else will be too — the whole sheet was read the same way. It takes about a
                    minute.
                  </p>
                </section>

                <section className="rx-panel">
                  <h2 className="rx-panel-h">Nothing lands until you say so</h2>
                  <p className="rx-panel-copy">
                    You see what would arrive before any of it does, and the whole import can be put
                    back for seven days afterwards.
                  </p>
                </section>
              </div>
            </div>
          </div>
        ) : null}

        {/*
          A37. One real line from their file, put back into words. If it reads
          right, everything else will be too — the whole sheet was read the
          same way. Twenty dropdowns ask a question a chef cannot answer; this
          asks one they can.
        */}
        {step === 'confirm' && parsed !== null && reading !== null ? (
          <section className="card ic">
            <div className="card-head">
              <h2 className="card-title">This is how we read your sheet.</h2>
            </div>

            <p className="sheet-copy map-copy">
              One real line from your file, put back into words. If it reads right, everything else
              will be too — the whole sheet was read the same way.
            </p>

            <div className="ic-row">
              <span className="ic-where figure">Row {reading.row + 1} of {lineCount}</span>
              <span className="ic-of figure">{(sample % Math.max(1, samples.length)) + 1} of {samples.length}</span>
              <span className="ic-step">
                <button
                  type="button"
                  className="set-pill"
                  aria-label="Previous row"
                  onClick={() => setSample((n) => (n - 1 + samples.length) % Math.max(1, samples.length))}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="set-pill"
                  aria-label="Next row"
                  onClick={() => setSample((n) => (n + 1) % Math.max(1, samples.length))}
                >
                  ›
                </button>
              </span>
            </div>

            {/* The sentence is the screen. */}
            <p className="ic-sentence">
              <b>{reading.name}</b>, <span className="figure">{qty(reading.qty ?? 0)}</span>{' '}
              {reading.unit} at <span className="figure">{m.withSymbol(reading.rate)}</span> per{' '}
              {reading.unit}, <span className="figure">{m.withSymbol(reading.lineTotal)}</span> the
              lot.
            </p>

            <div className="ic-meta">
              {reading.recipe === null ? null : <span>Recipe: {reading.recipe}</span>}
              {reading.section === null ? null : <span>Section: {reading.section}</span>}
            </div>

            {/* Only where the sheet's own total disagrees with the reading. */}
            {reading.sheetTotal !== null && !reading.agrees ? (
              <div className="import-note">
                <p className="import-alarm-title">Read that sentence again.</p>
                <p className="import-alarm-copy">
                  Your sheet says this line came to{' '}
                  <b className="figure">{m.withSymbol(reading.sheetTotal)}</b>, and read this way it
                  comes to <b className="figure">{m.withSymbol(reading.lineTotal)}</b>. If that is
                  not what your sheet means, two columns are the wrong way round — say no below and
                  put them right.
                </p>
              </div>
            ) : null}

            <div className="wizard-foot">
              {/* Straight to the commit. A38: nothing on the result screen
                  blocks the menu, so nothing before it needs to either. */}
              <button type="button" className="btn btn-primary" disabled={busy || plan === null} onClick={commit}>
                {busy ? 'Bringing it in…' : "Yes, that's right"}
              </button>
              <button type="button" className="btn" onClick={() => setStep('map')}>
                No — let me set the columns
              </button>
            </div>
            <p className="ic-reassure">
              Saying yes costs nothing. Anything read wrong is fixable afterwards without importing
              again.
            </p>
          </section>
        ) : null}

        {step === 'map' && parsed !== null ? (
          <div className="map-grid">
            {/*
              A37: a sheet reaches this step because something could not be
              guessed, so that is what it opens on. The rest are placed and do
              not need anyone — they are behind "Show all columns".
            */}
            {missing.length > 0 ? (
              <div className="import-note" role="alert">
                <p className="import-alarm-title">
                  {missing.length === 1 ? 'One thing we' : `${missing.length} things we`} couldn&rsquo;t
                  find in your sheet.
                </p>
                <p className="import-alarm-copy">
                  Everything else was read fine — we&rsquo;ve placed{' '}
                  <b className="figure">{header.length - missing.length}</b> of your{' '}
                  <b className="figure">{header.length}</b> columns.{' '}
                  {missing.length === 1 ? 'This one we can' : 'These we can'}&rsquo;t guess, and
                  without {missing.length === 1 ? 'it' : 'them'} nothing can be costed. Point at{' '}
                  {missing.length === 1 ? 'it' : 'them'} and we&rsquo;ll carry on.
                </p>
              </div>
            ) : null}
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

            {/*
              The sheet contradicting itself about a unit. Shown before the
              mapping, because it changes what every figure below it means —
              and asked rather than decided, because either answer is possible.
            */}
            {suspects.map((sus) => {
              const applied = rereadUnits[sus.wrote] === sus.means;
              return (
                <div className="import-note" key={sus.wrote} role="alert">
                  <p className="import-alarm-title">
                    <b className="figure">{sus.rows}</b> rows say &ldquo;{sus.wrote}&rdquo;, but the
                    quantities beside them look like {sus.means}.
                  </p>
                  <p className="import-alarm-copy">
                    A {sus.wrote} is a thousandth of a {sus.means}, so those quantities should be
                    about a thousand times larger than the rows written in {sus.means}. They are
                    not — the middle one is{' '}
                    <b className="figure">{sus.median}</b> against{' '}
                    <b className="figure">{sus.against}</b>. Read literally, an ingredient at 23 a{' '}
                    {sus.means} becomes 23 a {sus.wrote}, and one plate costs a thousand times what
                    it should.
                  </p>
                  <p className="import-alarm-copy">
                    Your rows:{' '}
                    {sus.examples.map((e) => (
                      <span className="figure" key={e.row}>
                        row {e.row} · {e.qty} {sus.wrote}&nbsp;&nbsp;
                      </span>
                    ))}
                  </p>
                  <div className="import-choice">
                    <button
                      type="button"
                      className={applied ? 'btn btn-primary' : 'btn'}
                      onClick={() => setRereadUnits((r) => ({ ...r, [sus.wrote]: sus.means }))}
                    >
                      Read them as {sus.means}
                    </button>
                    <button
                      type="button"
                      className={applied ? 'btn' : 'btn btn-primary'}
                      onClick={() =>
                        setRereadUnits((r) => {
                          const next = { ...r };
                          delete next[sus.wrote];
                          return next;
                        })
                      }
                    >
                      No — they really are {sus.wrote}
                    </button>
                  </div>
                </div>
              );
            })}

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

            {sheetTarget !== null && Math.abs(sheetTarget.percent - targetPercent) >= 0.1 ? (
              <div className="import-note">
                <p className="import-alarm-title">
                  Your sheet prices at {sheetTarget.percent.toFixed(1)}%. Your account is set to{' '}
                  {targetPercent.toFixed(1)}%.
                </p>
                <p className="import-alarm-copy">
                  {sheetTarget.rows} of the {sheetTarget.of} dishes carrying both{' '}
                  {sheetTarget.costHeader} and {sheetTarget.priceHeader} divide by the same figure,
                  so it is a decision rather than an accident. Costbook&rsquo;s{' '}
                  {targetPercent.toFixed(1)}% would suggest prices below the ones you set. The
                  target decides what price is suggested and nothing else — no cost on file moves.
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void onUseTarget?.(sheetTarget.percent)}
                >
                  Price at {sheetTarget.percent.toFixed(1)}%, as your sheet does
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
                      {FIELD_GROUPS.map((g) => (
                        <optgroup key={g} label={g}>
                          {FIELDS.filter((f) => f.group === g).map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    {/*
                      A column Costbook does not cost is still the operator's
                      column. It keeps the sheet's own heading by default, and
                      the name is theirs to change — shortening "Preparation
                      Method" to "method" on their behalf is how a sheet stops
                      looking like the one they keep.
                    */}
                    {fieldFor(i) === 'ignore' && h !== '' ? (
                      <label className="map-keep">
                        <span className="map-keep-label">Keep it as</span>
                        <input
                          className="map-keep-input"
                          value={customNames[i] ?? h}
                          onChange={(e) =>
                            setCustomNames((n) => ({ ...n, [i]: e.target.value }))
                          }
                          aria-label={`What to call ${h}`}
                        />
                      </label>
                    ) : null}
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

            {/*
              The rows the warnings are about, with their own figures, editable.
              A warning nobody can act on moves the work back to Excel — re-open
              the file, find the row, fix it, export, upload again — which is
              the same as not warning at all.

              The sheet on disk is never touched. Costbook only ever reads it.
            */}
            {flagged.length > 0 ? (
              <div className="fix">
                <div className="fix-head">
                  <h3 className="fix-title">
                    <b className="figure">{flagged.length}</b>{' '}
                    {flagged.length === 1 ? 'row is' : 'rows are'} worth a look — fix them here
                  </h3>
                  <p className="fix-copy">
                    Type over anything that is wrong and the figures below update as you go. Your
                    file is not changed; nothing is saved until you commit.
                  </p>
                </div>

                <table className="fix-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Ingredient</th>
                      <th>Qty</th>
                      <th>Unit</th>
                      <th>Rate</th>
                      <th>Why</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {flagged.slice(0, 60).map((f) => {
                      const e = rowEdits[f.row] ?? {};
                      const dropped = e.drop === true;
                      const set = (patch: Record<string, string | boolean>) =>
                        setRowEdits((r) => ({ ...r, [f.row]: { ...(r[f.row] ?? {}), ...patch } }));
                      return (
                        <tr key={f.row} data-severity={f.severity} data-dropped={dropped}>
                          <td className="figure fix-n">{f.row}</td>
                          <td>
                            <input className="fix-input" value={e.name ?? f.name}
                              aria-label={`Ingredient on row ${f.row}`}
                              onChange={(ev) => set({ name: ev.target.value })} />
                          </td>
                          <td>
                            <input className="fix-input figure is-num" value={e.qty ?? (f.qty ?? '')}
                              aria-label={`Quantity on row ${f.row}`}
                              onChange={(ev) => set({ qty: ev.target.value })} />
                          </td>
                          <td>
                            <input className="fix-input is-unit" value={e.unit ?? (f.unit ?? '')}
                              aria-label={`Unit on row ${f.row}`}
                              onChange={(ev) => set({ unit: ev.target.value })} />
                          </td>
                          <td>
                            <input className="fix-input figure is-num" value={e.rate ?? (f.rate ?? '')}
                              aria-label={`Rate on row ${f.row}`}
                              onChange={(ev) => set({ rate: ev.target.value })} />
                          </td>
                          <td className="fix-why">{f.why}</td>
                          <td>
                            {/* Leaving a row out is a decision, and a reversible
                                one. Nothing is deleted from the sheet. */}
                            <button type="button" className="set-pill"
                              onClick={() => set({ drop: !dropped })}>
                              {dropped ? 'Put it back' : 'Leave it out'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {flagged.length > 60 ? (
                  <p className="fix-copy figure">
                    60 of {flagged.length} shown. Fix these and the rest are usually the same thing.
                  </p>
                ) : null}
              </div>
            ) : null}

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
              <Arrival label="Ingredients kept as they are" value={plan.summary.ingredientsKept} />
              <Arrival label="Dishes already in your book, left alone" value={plan.summary.dishesKept} />
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

        {/*
          A38. Seven warning cards totalling 516, 83, 41, 9 and 7 become one
          number a chef recognises: dishes. A chef thinks "is my dosa costed",
          never "are 1,140 rows valid" — so the screen opens on the count with
          the menu one press away, and nothing on it blocks the menu.
        */}
        {step === 'done' && plan !== null ? (
          <section className="ac">
            {/*
              A failed import must say so here. The result message was rendered
              on the old screen and not on this one, so an import that wrote
              nothing showed a fix list and a file name and looked like it had
              worked.
            */}
            {result !== null && result.startsWith('Nothing was imported') ? (
              <div className="import-alarm" role="alert">
                <p className="import-alarm-title">Nothing was imported.</p>
                <p className="import-alarm-copy">{result.replace('Nothing was imported. ', '')}</p>
                <p className="import-alarm-copy">
                  Your sheet is untouched and nothing was half-written. Try again, or send us the
                  file and we&rsquo;ll look at it.
                </p>
              </div>
            ) : (
              <p className="ac-file figure">
                {fileName} · imported just now · undo for 7 days
              </p>
            )}

            <div className="ac-counts">
              <div>
                <b className="figure">{plan.summary.dishes}</b>
                <span>dishes costed.</span>
              </div>
              <div>
                <b className="figure">{plan.summary.ingredientsNew + plan.summary.ratesUpdated}</b>
                <span>ingredients priced.</span>
              </div>
            </div>

            <p className="ac-copy">
              Every one of them has a plate cost, a suggested price and a food cost you can open and
              read step by step. Your sheet is untouched.
            </p>

            <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push('/recipes')}>
              See your menu
            </button>

            {blocking.length > 0 ? (
              <div className="ac-fix">
                <h2 className="ac-fix-h">
                  <b className="figure">{blocking.length}</b>{' '}
                  {blocking.length === 1 ? 'dish needs' : 'dishes need'} something we
                  couldn&rsquo;t guess
                  <span className="ac-fix-note">worst first · nothing here blocks your menu</span>
                </h2>
                <p className="ac-copy">
                  None of these are mistakes on your part — they are places your sheet was written
                  for a person to read rather than a machine. Fix one now, or all of them next week;
                  the list waits on your dashboard either way.
                </p>

                <table className="fix-table">
                  <thead>
                    <tr>
                      <th>Row</th><th>Ingredient</th><th>Qty</th><th>Unit</th><th>Rate</th>
                      <th>Your sheet says</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {blocking.slice(0, 40).map((f) => {
                      const e = rowEdits[f.row] ?? {};
                      const dropped = e.drop === true;
                      const set = (patch: Record<string, string | boolean>) =>
                        setRowEdits((r) => ({ ...r, [f.row]: { ...(r[f.row] ?? {}), ...patch } }));
                      return (
                        <tr key={f.row} data-severity={f.severity} data-dropped={dropped}>
                          <td className="figure fix-n">{f.row}</td>
                          <td>
                            <input className="fix-input" value={e.name ?? f.name}
                              aria-label={`Ingredient on row ${f.row}`}
                              onChange={(ev) => set({ name: ev.target.value })} />
                          </td>
                          <td>
                            <input className="fix-input figure is-num" value={e.qty ?? (f.qty ?? '')}
                              aria-label={`Quantity on row ${f.row}`}
                              onChange={(ev) => set({ qty: ev.target.value })} />
                          </td>
                          <td>
                            <input className="fix-input is-unit" value={e.unit ?? (f.unit ?? '')}
                              aria-label={`Unit on row ${f.row}`}
                              onChange={(ev) => set({ unit: ev.target.value })} />
                          </td>
                          <td>
                            <input className="fix-input figure is-num" value={e.rate ?? (f.rate ?? '')}
                              aria-label={`Rate on row ${f.row}`}
                              onChange={(ev) => set({ rate: ev.target.value })} />
                          </td>
                          {/* The original, kept beside the correction. */}
                          <td className="fix-why figure">
                            {f.qty ?? '—'} {f.unit ?? ''}{f.rate === null ? '' : ` at ${f.rate}`}
                          </td>
                          <td>
                            <button type="button" className="set-pill" onClick={() => set({ drop: !dropped })}>
                              {dropped ? 'Put it back' : 'Leave it for now'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="ac-copy">
                  Left alone, the dish reports a floor rather than a cost — the real figure is
                  higher.
                </p>
              </div>
            ) : (
              <div className="ac-clear">
                <h2 className="ac-fix-h">Nothing needs you. Every dish is costed.</h2>
                <p className="ac-copy">
                  Your sheet had a rate, a quantity and a unit on every line that mattered. That is
                  rarer than you&rsquo;d think.
                </p>
              </div>
            )}

            {/* Collapsed to one line. 516 is not a number anyone can act on. */}
            {mild > 0 ? (
              <p className="ac-mild">
                <b className="figure">{mild}</b> other notes about your sheet — units that look odd,
                rows without a quantity, columns we did not read. None of them stop a dish being
                costed.{' '}
                <button type="button" className="link link-sm" onClick={() => router.push('/ingredients')}>
                  Look at them later
                </button>
              </p>
            ) : null}
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

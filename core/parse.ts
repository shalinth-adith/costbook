/**
 * Spreadsheet rows into structured lines.
 *
 * The first stage of the import pipeline, and the same code behind "paste rows"
 * on the recipe editor — a block pasted out of a spreadsheet and a whole
 * uploaded file are the same problem at different sizes (FLOWS 5).
 *
 * This module reads. It never writes, never guesses a rate, and never invents
 * a unit. Where it cannot be sure it produces a warning and leaves the figure
 * alone, because a wrong guess here poisons every file the operator touches
 * afterwards (TRD 3.1).
 *
 * Every pathology handled below was observed in one real workbook of 81
 * recipes. This is the importer's test checklist, not a list of hypotheticals
 * (TRD 7.1).
 */

import { isKnownUnit, normaliseUnit, toBase, unitFamily } from './units';

export type Field =
  /** The dish or batch this row belongs to. Without it there are no recipes. */
  | 'recipe'
  /** A grouping above the recipe, where a sheet carries one. */
  | 'section'
  | 'name'
  | 'qty'
  | 'unit'
  | 'rate'
  | 'total'
  | 'yield'
  /**
   * How many portions one batch plates.
   *
   * Without it a batch written to serve fifty is costed as though it served
   * one, and every figure on the dish is fifty times what it should be. The
   * reference workbook carries it as "Output (NO)".
   */
  | 'portions'
  /** What one batch yields, e.g. "Output (KG)". */
  | 'output'
  /** What the dish sells for, e.g. "Expected SP". */
  | 'sellingPrice'
  /** The method, which prints on the prep card rather than costing anything. */
  | 'method';

/**
 * The fields a sheet has to place before it can become a menu.
 *
 * Recipe name is one of them. Without it every row arrives as an ingredient
 * and no dish is made from any of them (A6).
 */
export const NEEDED_FIELDS: readonly Field[] = ['recipe', 'name', 'qty', 'unit'];

/** What the operator corrected on one row of their sheet. */
export interface RowEdit {
  readonly qty?: string;
  readonly unit?: string;
  readonly rate?: string;
  readonly name?: string;
  /** Leave the row out entirely. */
  readonly drop?: boolean;
}

/** Which column holds which field. Column indices, zero based. */
export type ColumnMapping = Partial<Record<Field, number>>;

export type ParseWarningCode =
  | 'no_header'
  | 'unmapped_columns'
  | 'unrecognised_unit'
  | 'no_rate'
  | 'no_quantity'
  | 'magnitude_suspect'
  | 'inconsistent_total'
  | 'possible_sub_recipe';

export interface ParseWarning {
  readonly code: ParseWarningCode;
  /** Plain language. Nothing here is ever shown as a code (FLOWS 3). */
  readonly message: string;
  /** The row it came from, zero based against the input. */
  readonly row: number | null;
  readonly subject: string;
}

/** Which figure the sheet actually carried, mirroring TRD 6.6. */
export type ParsedEntry = 'rate' | 'spend' | 'none';

export interface ParsedLine {
  readonly row: number;
  readonly name: string;
  /** A line with no usable unit is a cost with a label, not a measurement. */
  readonly kind: 'ingredient' | 'flat';
  readonly qty: number | null;
  /** The canonical unit, or null when the sheet's word is not one. */
  readonly unit: string | null;
  /** What the sheet actually said, kept for display and for the review screen. */
  readonly rawUnit: string | null;
  readonly rate: number | null;
  readonly total: number | null;
  readonly entry: ParsedEntry;
  readonly warnings: readonly ParseWarning[];
}

export interface ParsedBlock {
  readonly name: string;
  readonly row: number;
  readonly lines: readonly ParsedLine[];
  /**
   * Read from the recipe's first row, where a sheet that carries them puts
   * them once for the whole block rather than on every line.
   *
   * Portions is the one that matters most: without it a batch written to serve
   * fifty is costed as though it served one.
   */
  readonly portions: number | null;
  readonly outputQty: number | null;
  readonly outputUnit: string | null;
  readonly sellingPrice: number | null;
  readonly method: string | null;
  /**
   * Columns Costbook does not cost, under the sheet's own headings.
   *
   * Kept rather than discarded (PRD 6). The sheet is the operator's record of
   * how they cost; an import that drops a third of it is one they cannot check
   * against what they had.
   */
  readonly custom: Readonly<Record<string, string>>;
}

export interface ParseResult {
  readonly headerRow: number | null;
  readonly mapping: ColumnMapping;
  /** Columns we recognised but were not asked to use. Nothing is discarded. */
  readonly unmappedColumns: readonly { index: number; header: string }[];
  readonly blocks: readonly ParsedBlock[];
  readonly warnings: readonly ParseWarning[];
}

export interface ParseOptions {
  /**
   * What to call a column Costbook keeps but does not cost, by index. Defaults
   * to the sheet's own heading — shortening it on the operator's behalf is how
   * a book stops looking like the sheet they keep.
   */
  readonly keepAs?: Readonly<Record<number, string>>;
  /**
   * Unit labels to read as something else, agreed by the operator.
   *
   * A sheet that writes "gm" beside quantities the size of kilos is
   * contradicting itself; `suspectUnits` finds that and the operator settles
   * it. Applied here so every figure downstream is already right, rather than
   * corrected in six places afterwards.
   */
  readonly rereadUnits?: Readonly<Record<string, string>>;
  /**
   * Corrections the operator typed for individual rows, by row number.
   *
   * A warning nobody can act on moves the work back to Excel: re-open, find
   * the row, fix it, export, upload again. These let a row be corrected where
   * it is flagged, before anything is committed, and the sheet on disk is
   * never touched — Costbook only ever reads it.
   */
  readonly rowEdits?: Readonly<Record<number, RowEdit>>;
  /** Skip header detection and use this row. */
  readonly headerRow?: number;
  /** Skip column detection and use this mapping. */
  readonly mapping?: ColumnMapping;
  /**
   * Recipe names already on file. A line whose name matches one is flagged as
   * a sub-recipe the operator has been faking by hand — the strongest signal
   * in the file that they want nesting (TRD 7.1).
   */
  readonly knownRecipes?: readonly string[];
}

/* ── cells ──────────────────────────────────────────────────────────── */

const text = (cell: string | undefined): string => (cell ?? '').trim();

const isBlank = (row: readonly string[]): boolean => row.every((c) => text(c) === '');

/**
 * A figure out of a spreadsheet cell. Handles thousands separators in both
 * the Indian and Western groupings, a leading currency symbol, and a trailing
 * percent — and returns null rather than NaN for anything else, so an unparsed
 * cell stays absent instead of becoming a zero.
 */
export function parseNumber(cell: string | undefined): number | null {
  const raw = text(cell);
  if (raw === '') return null;

  const cleaned = raw
    .replace(/[₹$£€]/g, '')
    .replace(/,/g, '')
    .replace(/%$/, '')
    .replace(/\s/g, '');

  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Whether a cell reads as words rather than as a figure. */
const isTextual = (cell: string | undefined): boolean => {
  const raw = text(cell);
  return raw !== '' && parseNumber(raw) === null;
};

/* ── header ─────────────────────────────────────────────────────────── */

const HEADER_SCAN_DEPTH = 15;

/**
 * The header is the densest row of words in the first stretch of the sheet.
 *
 * Never assume row one. Real files carry a title, a section banner, and a
 * blank above the header, and a parser that starts at the top reads a shop
 * name as a column heading (TRD 7).
 */
export function detectHeaderRow(rows: readonly (readonly string[])[]): number | null {
  let best: number | null = null;
  let bestCount = 1;

  const depth = Math.min(rows.length, HEADER_SCAN_DEPTH);
  for (let i = 0; i < depth; i += 1) {
    const row = rows[i];
    if (row === undefined) continue;
    const count = row.filter(isTextual).length;
    if (count > bestCount) {
      bestCount = count;
      best = i;
    }
  }
  return best;
}

const HEADER_ALIASES: Readonly<Record<Field, readonly string[]>> = {
  // Deliberately narrow. "Item" and "product" are what most sheets call the
  // ingredient, so claiming them here would take the name column away.
  recipe: ['recipe', 'recipe name', 'dish', 'dish name', 'menu item', 'preparation', 'sub recipe'],
  section: ['section', 'category', 'group', 'menu section', 'course'],
  name: ['ingredient', 'ingredients', 'ingredient name', 'item', 'item description', 'description', 'particulars', 'material', 'product'],
  qty: ['qty', 'quantity', 'qnty', 'weight', 'wt', 'used', 'qty used'],
  unit: ['unit', 'units', 'uom', 'u.o.m'],
  rate: ['rate', 'rate/unit', 'rate per unit', 'unit rate', 'unit price', 'cost/unit', 'rate per kg'],
  /*
   * "Price" belongs here rather than with the rate. In the reference workbook
   * the Price column is `=Quantity * Unit Rate` — a line total — while Unit
   * Rate is the rate. A sheet that carries both and calls the second one Price
   * is the common shape, and reading it as a rate divides by the quantity
   * twice.
   */
  total: ['total', 'amount', 'value', 'cost', 'line total', 'total cost', 'price', 'line cost', 'line value'],
  yield: ['yield', 'yield%', 'yield %', 'yield percent'],
  /*
   * A batch that plates into fifty and a batch that plates into one differ by
   * a factor of fifty in every figure the operator reads, so these are worth
   * recognising rather than leaving to be mapped by hand.
   */
  portions: ['output no', 'output nos', 'portions', 'portion', 'serves', 'yield nos', 'no of portions', 'pieces', 'pcs', 'qty produced'],
  output: ['output kg', 'output', 'batch size', 'batch output', 'output qty', 'total output', 'yield kg'],
  sellingPrice: ['expected sp', 'sp', 'selling price', 'menu price', 'mrp', 'price to customer', 'expected selling price'],
  method: ['preparation method', 'method', 'preparation', 'procedure', 'recipe method', 'instructions', 'prep method'],
};

/**
 * Columns a sheet computes and Costbook computes again.
 *
 * These must not be mapped. "Cost per Item" reads as a cost and would take the
 * line-total slot from the column that actually holds one — and importing a
 * figure Costbook derives means importing the sheet's answer instead of
 * checking it.
 */
const DERIVED_HEADERS: readonly string[] = [
  'cost per item', 'cost per portion', 'cost per plate', 'cost per unit produced',
  'food cost', 'food cost %', 'margin', 'profit', 'gp', 'gp %',
];

/** Currency codes a header may carry, e.g. "Price (AED)". */
const CURRENCY_IN_HEADER = /\b(aed|inr|usd|eur|gbp|sar|qar|omr|bhd|kwd|lkr|bdt|npr|pkr|myr|sgd|aud|cad|zar|kes|ngn|jpy)\b/;

/**
 * The currency a sheet prices in, read off its own headings.
 *
 * A sheet whose money column says "Price (AED)" is telling us what its figures
 * are in. Asking the operator to state it again, and silently costing in
 * something else until they do, is the kind of quiet wrongness this product
 * exists to avoid.
 */
export function currencyFromHeader(header: readonly string[]): string | null {
  for (const cell of header) {
    const match = CURRENCY_IN_HEADER.exec(String(cell ?? '').toLowerCase());
    if (match !== null && match[1] !== undefined) return match[1].toUpperCase();
  }
  return null;
}

/**
 * The cells in columns nothing was mapped to, under the names the operator
 * chose — which default to the sheet's own headings.
 */
function keptFrom(
  row: readonly string[],
  header: readonly string[],
  mapping: ColumnMapping,
  keepAs: Readonly<Record<number, string>>,
): Record<string, string> {
  const taken = new Set(Object.values(mapping));
  const out: Record<string, string> = {};
  for (let i = 0; i < header.length; i += 1) {
    if (taken.has(i)) continue;
    const value = text(row[i]);
    if (value === '') continue;
    const label = keepAs[i] ?? text(header[i]);
    if (label === '') continue;
    out[label] = value;
  }
  return out;
}

const normaliseHeader = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[().]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // "price aed" is the same column as "price". The currency is read
    // separately by currencyFromHeader.
    .replace(CURRENCY_IN_HEADER, '')
    .trim();

/** Match column headings against the words real sheets use. */
export function detectMapping(header: readonly string[]): ColumnMapping {
  const mapping: Record<string, number> = {};

  header.forEach((cell, index) => {
    const key = normaliseHeader(text(cell));
    if (key === '') return;
    if (DERIVED_HEADERS.includes(key)) return;

    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (mapping[field] !== undefined) continue;
      if (aliases.includes(key) || aliases.some((a) => key.startsWith(`${a} `))) {
        mapping[field] = index;
        return;
      }
    }
  });

  return mapping as ColumnMapping;
}

/* ── plausibility ───────────────────────────────────────────────────── */

/**
 * What a quantity in this unit could sensibly be, in base units.
 *
 * The workbook carried 97 rows labelled `gm` that held kilograms, written as
 * an inline `=50/1000`. The label is decorative; the arithmetic is real. We
 * cannot know which is right, so we flag rather than correct — silently
 * multiplying by a thousand is how a parser destroys a menu.
 */
const PLAUSIBLE: Readonly<Record<string, { readonly min: number; readonly max: number }>> = {
  mass: { min: 0.1, max: 200_000 },
  volume: { min: 0.1, max: 200_000 },
  count: { min: 0.01, max: 10_000 },
};

function magnitudeWarning(
  name: string,
  row: number,
  qty: number,
  unit: string,
  rawUnit: string,
): ParseWarning | null {
  const family = unitFamily(unit);
  if (family === null) return null;

  const range = PLAUSIBLE[family];
  if (range === undefined) return null;

  // The quantity arrives in the sheet's own unit, so it has to be converted
  // before it can be judged. Without this, 1000 labelled kg reads as a
  // plausible 1000 rather than as a literal tonne.
  const inBase = toBase(qty, unit);
  if (inBase >= range.min && inBase <= range.max) return null;

  return {
    code: 'magnitude_suspect',
    message:
      `${name} reads as ${qty} ${rawUnit}, which is an unusual amount for a recipe. ` +
      'Check whether the sheet meant a different unit — Costbook has kept the figure as written.',
    row,
    subject: name,
  };
}

/* ── lines ──────────────────────────────────────────────────────────── */

function parseLine(
  row: readonly string[],
  index: number,
  mapping: ColumnMapping,
  knownRecipes: readonly string[],
  reread: Readonly<Record<string, string>> = {},
  edit: RowEdit | undefined = undefined,
): ParsedLine | null {
  // A row the operator struck out is not read at all.
  if (edit?.drop === true) return null;

  const nameCol = mapping.name;
  if (nameCol === undefined) return null;

  const name = edit?.name !== undefined ? edit.name.trim() : text(row[nameCol]);
  if (name === '') return null;

  const warnings: ParseWarning[] = [];

  /*
   * The operator's correction stands in for the cell, and nothing distinguishes
   * it downstream — a row they fixed is a row, not a special case.
   */
  const qty = edit?.qty !== undefined
    ? parseNumber(edit.qty)
    : mapping.qty === undefined ? null : parseNumber(row[mapping.qty]);
  const rawUnit = edit?.unit !== undefined
    ? (edit.unit.trim() || null)
    : mapping.unit === undefined ? null : text(row[mapping.unit]) || null;
  const rate = edit?.rate !== undefined
    ? parseNumber(edit.rate)
    : mapping.rate === undefined ? null : parseNumber(row[mapping.rate]);
  const total = mapping.total === undefined ? null : parseNumber(row[mapping.total]);

  /*
   * The operator's answer about a label the sheet contradicts itself over is
   * applied here, before anything is measured or costed with it.
   */
  const canonical = rawUnit === null ? null : normaliseUnit(rawUnit);
  const unit = canonical === null ? null : (reread[canonical] ?? canonical);

  // A word that is not a unit makes this a cost with a label, not a
  // measurement. `as req`, `lot`, `pinch`, `pkt`, `box` all land here rather
  // than being forced into a family that produces nonsense (TRD 3.1).
  const kind: ParsedLine['kind'] = rawUnit !== null && unit === null ? 'flat' : 'ingredient';

  if (kind === 'flat' && rawUnit !== null) {
    warnings.push({
      code: 'unrecognised_unit',
      message:
        `"${rawUnit}" is not a unit Costbook measures in, so ${name} comes in as a cost with a ` +
        'label rather than a quantity. It will add to the batch and stay out of every yield.',
      row: index,
      subject: name,
    });
  }

  // The rate is derived from the spend when that is what the sheet carries.
  // 251 lines in the reference workbook work this way, because it is how the
  // information arrives (TRD 6.6).
  let entry: ParsedEntry = 'none';
  if (rate !== null) entry = 'rate';
  else if (total !== null && qty !== null && qty > 0) entry = 'spend';

  if (rate !== null && total !== null && qty !== null && qty > 0) {
    const implied = rate * qty;
    // The sheet's own rounding is ignored entirely and recomputed, so a small
    // gap is expected; a large one means the two columns disagree.
    if (Math.abs(implied - total) > Math.max(0.05, Math.abs(total) * 0.02)) {
      warnings.push({
        code: 'inconsistent_total',
        message:
          `${name} shows a rate of ${rate} and a total of ${total}, but ${qty} at that rate is ` +
          `${implied.toFixed(2)}. Costbook has kept both figures for you to choose between.`,
        row: index,
        subject: name,
      });
    }
  }

  if (kind === 'ingredient' && qty === null) {
    warnings.push({
      code: 'no_quantity',
      message: `${name} has no quantity, so it cannot be costed as a measured line yet.`,
      row: index,
      subject: name,
    });
  }

  if (rate === null && total === null) {
    // Never invented. A free ingredient such as water is a real thing, and so
    // is a rate nobody has entered; the two are told apart later, not here.
    warnings.push({
      code: 'no_rate',
      message:
        `${name} has no rate and no total. It comes in unpriced, and any dish using it reports ` +
        'a floor rather than a cost until you give it one.',
      row: index,
      subject: name,
    });
  }

  if (qty !== null && unit !== null && rawUnit !== null) {
    const suspect = magnitudeWarning(name, index, qty, unit, rawUnit);
    if (suspect !== null) warnings.push(suspect);
  }

  /**
   * The strongest signal in the file. `Poriya (side), 13 portion @ 0.50` is a
   * sub-recipe the operator has been faking with a hand-guessed rate, and
   * turning one into a real link is the most persuasive thing the product can
   * do in the first five minutes (TRD 7.1).
   */
  const match = knownRecipes.find((r) => sameName(r, name));
  if (match !== undefined) {
    warnings.push({
      code: 'possible_sub_recipe',
      message:
        `You already have a recipe called ${match}. This line looks like it was standing in for ` +
        'it — link it and Costbook will carry its real cost and yield across instead.',
      row: index,
      subject: name,
    });
  }

  return { row: index, name, kind, qty, unit, rawUnit, rate, total, entry, warnings };
}

/** Names match ignoring case, spacing and a trailing parenthetical. */
function sameName(a: string, b: string): boolean {
  const clean = (s: string) =>
    s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  return clean(a) === clean(b);
}

/* ── blocks ─────────────────────────────────────────────────────────── */

const TOTAL_WORDS = ['total', 'grand total', 'sub total', 'subtotal', 'cost per portion', 'selling price'];

const isTotalRow = (row: readonly string[], nameCol: number): boolean =>
  TOTAL_WORDS.includes(normaliseHeader(text(row[nameCol])));

/**
 * Group rows into recipe blocks.
 *
 * In a real file a block is a name row followed by ingredient rows until a
 * blank or a total row. The name row is the one carrying words and no
 * quantity — everything else in the block has a quantity beside it.
 */
export function parseRows(
  rows: readonly (readonly string[])[],
  options: ParseOptions = {},
): ParseResult {
  const warnings: ParseWarning[] = [];
  const knownRecipes = options.knownRecipes ?? [];
  // What the operator chose to call each kept column, by index. Empty means
  // the sheet's own heading stands.
  const keepAs = options.keepAs ?? {};
  const rereadUnits = options.rereadUnits ?? {};
  const rowEdits = options.rowEdits ?? {};

  const headerRow = options.headerRow ?? detectHeaderRow(rows);

  if (headerRow === null && options.mapping === undefined) {
    warnings.push({
      code: 'no_header',
      message:
        'Costbook could not find a row of column headings in this sheet. Point at the header row ' +
        'and it will read the rest.',
      row: null,
      subject: 'the sheet',
    });
    return { headerRow: null, mapping: {}, unmappedColumns: [], blocks: [], warnings };
  }

  const header = headerRow === null ? [] : (rows[headerRow] ?? []);
  const mapping = options.mapping ?? detectMapping(header);

  const used = new Set(Object.values(mapping));
  const unmappedColumns = header
    .map((cell, index) => ({ index, header: text(cell) }))
    .filter((c) => c.header !== '' && !used.has(c.index));

  if (unmappedColumns.length > 0) {
    warnings.push({
      code: 'unmapped_columns',
      message:
        `${unmappedColumns.length} column${unmappedColumns.length === 1 ? '' : 's'} were not ` +
        'recognised. Nothing is discarded — they are kept as they are until you say what they mean.',
      row: headerRow,
      subject: unmappedColumns.map((c) => c.header).join(', '),
    });
  }

  const nameCol = mapping.name;
  if (nameCol === undefined) {
    return { headerRow, mapping, unmappedColumns, blocks: [], warnings };
  }

  interface OpenBlock {
    name: string;
    row: number;
    lines: ParsedLine[];
    portions: number | null;
    outputQty: number | null;
    outputUnit: string | null;
    sellingPrice: number | null;
    method: string | null;
    custom: Record<string, string>;
  }

  const blocks: OpenBlock[] = [];
  let current: OpenBlock | null = null;

  const start = (headerRow ?? -1) + 1;

  /**
   * When the sheet names the recipe on every row, that column is the grouping
   * and nothing has to be inferred. Guessing blocks from blank rows works on a
   * sheet laid out in blocks and produces almost no dishes on one that is not
   * — six from over a thousand rows, which a menu that size never has (A7b).
   */
  const recipeCol = mapping.recipe;
  if (recipeCol !== undefined) {
    const byRecipe = new Map<string, OpenBlock>();

    /**
     * A merged cell carries its value on the first row of the run and leaves
     * the rest blank, and plenty of sheets do the same by hand without merging
     * anything. Either way a blank in a grouping column does not mean "no
     * recipe" — it means "the same one as above" (TRD 7).
     *
     * Without carrying it down, a chutney of seven ingredients arrives as one
     * line of coconut and the other six are thrown away.
     */
    let carriedRecipe = '';

    for (let i = start; i < rows.length; i += 1) {
      const row = rows[i];
      if (row === undefined) continue;

      // A genuinely empty row ends the run, so the next value starts fresh
      // rather than inheriting from far above it.
      if (isBlank(row)) {
        carriedRecipe = '';
        continue;
      }
      if (isTotalRow(row, nameCol)) continue;

      const stated = text(row[recipeCol]);
      if (stated !== '') carriedRecipe = stated;

      const recipeName = carriedRecipe;
      if (recipeName === '') continue;

      const line = parseLine(row, i, mapping, knownRecipes, rereadUnits, rowEdits[i]);
      if (line === null) continue;

      const key = recipeName.toLowerCase();
      const block =
        byRecipe.get(key) ??
        {
          name: recipeName,
          row: i,
          lines: [],
          // Taken from the row that names the recipe, which is where a sheet
          // laid out in blocks states them.
          portions: mapping.portions === undefined ? null : parseNumber(row[mapping.portions]),
          outputQty: mapping.output === undefined ? null : parseNumber(row[mapping.output]),
          outputUnit: mapping.output === undefined ? null : 'kg',
          sellingPrice: mapping.sellingPrice === undefined ? null : parseNumber(row[mapping.sellingPrice]),
          method: mapping.method === undefined ? null : (text(row[mapping.method]) || null),
          custom: keptFrom(row, header, mapping, keepAs),
        };
      block.lines.push(line);
      byRecipe.set(key, block);
    }

    const grouped: ParsedBlock[] = [...byRecipe.values()]
      .filter((b) => b.lines.length > 0)
      .map((b) => ({
        name: b.name,
        row: b.row,
        lines: [...b.lines],
        portions: b.portions,
        outputQty: b.outputQty,
        outputUnit: b.outputUnit,
        sellingPrice: b.sellingPrice,
        method: b.method,
        custom: b.custom,
      }));

    for (const block of grouped) {
      for (const line of block.lines) warnings.push(...line.warnings);
    }

    return { headerRow, mapping, unmappedColumns, blocks: grouped, warnings };
  }

  const open = (name: string, row: number): OpenBlock => {
    const block: OpenBlock = {
      name, row, lines: [],
      portions: null, outputQty: null, outputUnit: null, sellingPrice: null, method: null,
      custom: {},
    };
    blocks.push(block);
    return block;
  };

  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i];
    if (row === undefined) continue;

    // A blank row ends a block, and so does a totals row — whose figures are
    // the sheet's own arithmetic, which we ignore and recompute (TRD 7.1).
    if (isBlank(row) || isTotalRow(row, nameCol)) {
      current = null;
      continue;
    }

    const line = parseLine(row, i, mapping, knownRecipes, rereadUnits, rowEdits[i]);
    if (line === null) continue;

    // A name carrying no quantity and no money is a heading, not a line.
    const hasFigures = line.qty !== null || line.rate !== null || line.total !== null;
    if (!hasFigures) {
      current = open(line.name, i);
      continue;
    }

    // Lines before any heading: a pasted block with no title of its own.
    current ??= open('', i);
    current.lines.push(line);
  }

  // Blocks that never gathered a line were headings for nothing.
  const settled: ParsedBlock[] = blocks
    .filter((b) => b.lines.length > 0)
    .map((b) => ({
      name: b.name,
      row: b.row,
      lines: [...b.lines],
      portions: b.portions,
      outputQty: b.outputQty,
      outputUnit: b.outputUnit,
      sellingPrice: b.sellingPrice,
      method: b.method,
      custom: b.custom,
    }));

  for (const block of settled) {
    for (const line of block.lines) warnings.push(...line.warnings);
  }

  return { headerRow, mapping, unmappedColumns, blocks: settled, warnings };
}

/* ── tab separated text ─────────────────────────────────────────────── */

/**
 * A block pasted straight out of a spreadsheet.
 *
 * The same parser as the file importer, deliberately: a paste and an upload
 * meet the same messy data, and two code paths would drift (FLOWS 5).
 */
export function parseTsv(input: string, options: ParseOptions = {}): ParseResult {
  const rows = input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.split('\t'));

  return parseRows(rows, options);
}

/** Every warning about one row, for the review screen's grouping. */
export function warningsByRow(result: ParseResult): ReadonlyMap<number, readonly ParseWarning[]> {
  const map = new Map<number, ParseWarning[]>();
  for (const warning of result.warnings) {
    if (warning.row === null) continue;
    const list = map.get(warning.row) ?? [];
    list.push(warning);
    map.set(warning.row, list);
  }
  return map;
}

/* ── reading one row back ───────────────────────────────────────────── */

export interface RowReading {
  readonly row: number;
  readonly name: string;
  readonly qty: number | null;
  readonly unit: string;
  readonly rate: number | null;
  /** qty x rate, as the mapping currently reads the row. */
  readonly lineTotal: number | null;
  /** What the sheet itself says the line came to, where it says so. */
  readonly sheetTotal: number | null;
  readonly recipe: string | null;
  readonly section: string | null;
  /** True when the reading agrees with the sheet's own total. */
  readonly agrees: boolean;
  /**
   * How far out the reading is. A factor rather than a difference, because a
   * mapping mistake is almost always off by an order of magnitude and a
   * difference of 177 says nothing while "eight times" says everything.
   */
  readonly factor: number | null;
  /** True when rate and total look swapped: the commonest mapping mistake. */
  readonly reversed: boolean;
}

/**
 * One real row, read back as a sentence.
 *
 * A chef cannot tell whether Price maps to Rate per unit or to Line total by
 * reading the two labels. Read back as "8 kg at 25.28 per kg = 202.24" against
 * a sheet that says 25.28, the same mistake is obvious to someone who has
 * never heard of column mapping (A6).
 */
export function readRow(
  rows: readonly (readonly string[])[],
  index: number,
  mapping: ColumnMapping,
): RowReading | null {
  const row = rows[index];
  if (row === undefined) return null;

  const nameCol = mapping.name;
  const name = nameCol === undefined ? '' : text(row[nameCol]);
  if (name === '') return null;

  const qty = mapping.qty === undefined ? null : parseNumber(row[mapping.qty]);
  const rawUnit = mapping.unit === undefined ? null : text(row[mapping.unit]);
  const rate = mapping.rate === undefined ? null : parseNumber(row[mapping.rate]);
  const sheetTotal = mapping.total === undefined ? null : parseNumber(row[mapping.total]);
  const recipe = mapping.recipe === undefined ? null : text(row[mapping.recipe]) || null;
  const section = mapping.section === undefined ? null : text(row[mapping.section]) || null;

  const lineTotal = qty !== null && rate !== null ? qty * rate : null;

  let agrees = true;
  let factor: number | null = null;
  let reversed = false;

  if (lineTotal !== null && sheetTotal !== null && sheetTotal !== 0) {
    const off = Math.abs(lineTotal - sheetTotal);
    agrees = off <= Math.max(0.05, Math.abs(sheetTotal) * 0.02);
    if (!agrees) {
      factor = lineTotal / sheetTotal;
      // Rate and total swapped: what the sheet calls the total, divided by the
      // quantity, is the rate - and multiplying by qty then lands on the rate.
      if (qty !== null && qty !== 0) {
        const asRate = sheetTotal / qty;
        reversed = Math.abs(asRate * qty - sheetTotal) < 0.005 && Math.abs(rate ?? 0) > Math.abs(asRate);
      }
    }
  }

  return {
    row: index,
    name,
    qty,
    unit: rawUnit === null || rawUnit === '' ? '' : (normaliseUnit(rawUnit) ?? rawUnit),
    rate,
    lineTotal,
    sheetTotal,
    recipe,
    section,
    agrees,
    factor,
    reversed,
  };
}

/**
 * A few rows worth reading, not just the first.
 *
 * One row hides a unit problem. Rice bought by the kilogram and fifteen grams
 * of ghee fail differently, so the preview steps through a spread (A6).
 */
export function sampleRows(
  rows: readonly (readonly string[])[],
  mapping: ColumnMapping,
  headerRow: number | null,
  count = 3,
): readonly number[] {
  const start = (headerRow ?? -1) + 1;
  const usable: number[] = [];

  for (let i = start; i < rows.length; i += 1) {
    const reading = readRow(rows, i, mapping);
    if (reading !== null && reading.qty !== null) usable.push(i);
  }
  if (usable.length === 0) return [];

  // Spread across the sheet rather than taking the first few, which are often
  // the tidiest rows in the file.
  const step = Math.max(1, Math.floor(usable.length / count));
  const picked: number[] = [];
  for (let i = 0; i < usable.length && picked.length < count; i += step) {
    const at = usable[i];
    if (at !== undefined) picked.push(at);
  }
  return picked;
}

/** Which needed fields the mapping is still missing. */
export function missingFields(mapping: ColumnMapping): readonly Field[] {
  return NEEDED_FIELDS.filter((f) => mapping[f] === undefined);
}

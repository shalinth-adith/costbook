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

export type Field = 'name' | 'qty' | 'unit' | 'rate' | 'total' | 'yield';

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
  name: ['ingredient', 'ingredients', 'item', 'item description', 'description', 'particulars', 'name', 'product'],
  qty: ['qty', 'quantity', 'qnty', 'weight', 'wt', 'used'],
  unit: ['unit', 'units', 'uom', 'u.o.m'],
  rate: ['rate', 'rate/unit', 'rate per unit', 'price', 'unit price', 'cost/unit'],
  total: ['total', 'amount', 'value', 'cost', 'line total', 'total cost'],
  yield: ['yield', 'yield%', 'yield %', 'yield percent'],
};

const normaliseHeader = (raw: string): string =>
  raw.toLowerCase().replace(/[().]/g, '').replace(/\s+/g, ' ').trim();

/** Match column headings against the words real sheets use. */
export function detectMapping(header: readonly string[]): ColumnMapping {
  const mapping: Record<string, number> = {};

  header.forEach((cell, index) => {
    const key = normaliseHeader(text(cell));
    if (key === '') return;

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
): ParsedLine | null {
  const nameCol = mapping.name;
  if (nameCol === undefined) return null;

  const name = text(row[nameCol]);
  if (name === '') return null;

  const warnings: ParseWarning[] = [];

  const qty = mapping.qty === undefined ? null : parseNumber(row[mapping.qty]);
  const rawUnit = mapping.unit === undefined ? null : text(row[mapping.unit]) || null;
  const rate = mapping.rate === undefined ? null : parseNumber(row[mapping.rate]);
  const total = mapping.total === undefined ? null : parseNumber(row[mapping.total]);

  const unit = rawUnit === null ? null : normaliseUnit(rawUnit);

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
  }

  const blocks: OpenBlock[] = [];
  let current: OpenBlock | null = null;

  const open = (name: string, row: number): OpenBlock => {
    const block: OpenBlock = { name, row, lines: [] };
    blocks.push(block);
    return block;
  };

  const start = (headerRow ?? -1) + 1;
  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i];
    if (row === undefined) continue;

    // A blank row ends a block, and so does a totals row — whose figures are
    // the sheet's own arithmetic, which we ignore and recompute (TRD 7.1).
    if (isBlank(row) || isTotalRow(row, nameCol)) {
      current = null;
      continue;
    }

    const line = parseLine(row, i, mapping, knownRecipes);
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
    .map((b) => ({ name: b.name, row: b.row, lines: [...b.lines] }));

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

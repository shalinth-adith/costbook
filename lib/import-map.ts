/**
 * The column map, remembered between imports.
 *
 * FLOWS 3.3: "Mapping is remembered. Next month the same sheet uploads and the
 * map step is already filled in; the user is only asked about columns that
 * changed." That is what turns import from a one-time onboarding event into a
 * monthly rhythm, and the rhythm is the retention.
 *
 * WHAT IS STORED, AND WHY NOT THE COLUMN NUMBER. A `ColumnMapping` is
 * field → column index, which is the wrong thing to keep. Sheets grow a column
 * in January and every remembered index is off by one, silently, reading rates
 * out of the yield column. What survives a sheet being edited is the header
 * text a person typed, so that is what is kept — with the old index alongside
 * it, used only to break a tie when a sheet carries the same header twice.
 *
 * Matching is exact after normalising case and spacing, deliberately. A fuzzy
 * match that turns "Rate" into "Rate/kg" would be a wrong mapping presented as
 * a remembered one, which is worse than asking again: the operator skips the
 * step precisely because they trust it.
 */

import type { ColumnMapping, Field } from "@/core/parse";

/** One remembered column: what its header said, and where it sat. */
export interface RememberedColumn {
  readonly header: string;
  readonly at: number;
}

/** Field → the column it was mapped to, last time this account imported. */
export type RememberedMap = Readonly<Partial<Record<Field, RememberedColumn>>>;

export interface Restored {
  readonly mapping: ColumnMapping;
  /** Fields filled in from memory rather than from detection. */
  readonly restored: readonly Field[];
  /**
   * Fields this account mapped last time whose column is not in this sheet.
   * These are the ones §3.3 means by "columns that changed" — the only part
   * of the map worth asking about again.
   */
  readonly changed: readonly Field[];
}

/**
 * Header text, compared the way a person would.
 *
 * Case and spacing are noise — a sheet re-saved from Numbers turns "Qty " into
 * "Qty". A trailing colon or asterisk is the same header with punctuation, so
 * those go too. Everything else stays: "Rate" and "Rate/kg" are two different
 * questions and must not collapse into one.
 */
export function sameHeader(a: string, b: string): boolean {
  return normalise(a) === normalise(b);
}

const normalise = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[:*]+$/, "")
    .trim();

/**
 * What to remember from a map the operator accepted.
 *
 * Only fields pointing at a real column: a mapping can carry an index past the
 * end of a short header row, and remembering that would restore a field to a
 * column that does not exist.
 */
export function rememberMap(
  mapping: ColumnMapping,
  header: readonly string[],
): RememberedMap {
  const out: Record<string, RememberedColumn> = {};
  for (const [field, at] of Object.entries(mapping)) {
    if (typeof at !== "number") continue;
    const text = header[at];
    if (text === undefined || text.trim() === "") continue;
    out[field] = { header: text, at };
  }
  return out as RememberedMap;
}

/**
 * Lay a remembered map over what detection found.
 *
 * Memory wins where the two disagree, because a remembered map is one the
 * operator corrected by hand and detection is a guess. Detection still fills
 * anything memory does not cover, so a sheet that grew a column since last
 * month arrives with the new column detected and the old ones remembered.
 */
export function applyRemembered(
  remembered: RememberedMap,
  header: readonly string[],
  detected: ColumnMapping,
): Restored {
  const mapping: Record<string, number> = {};
  const taken = new Set<number>();
  const restored: Field[] = [];
  const changed: Field[] = [];

  for (const [field, col] of Object.entries(remembered)) {
    if (col === undefined) continue;
    const at = columnFor(col, header, taken);
    if (at === null) {
      changed.push(field as Field);
      continue;
    }
    mapping[field] = at;
    taken.add(at);
    restored.push(field as Field);
  }

  /*
   * Detection fills the gaps, never overwrites. A column already claimed by
   * memory is skipped rather than mapped twice: two fields on one column is
   * not a mapping the parser can act on, and the one it would drop is
   * unpredictable.
   */
  for (const [field, at] of Object.entries(detected)) {
    if (typeof at !== "number") continue;
    if (field in mapping) continue;
    if (taken.has(at)) continue;
    mapping[field] = at;
    taken.add(at);
  }

  return { mapping: mapping as ColumnMapping, restored, changed };
}

/**
 * Where a remembered column sits in this sheet.
 *
 * By header text, with the old index as a tiebreak only. A sheet with two
 * columns both called "Qty" is not unusual — one for the batch and one for the
 * plate — and picking the one that was picked last time is the only answer
 * that is better than a coin toss.
 */
function columnFor(
  col: RememberedColumn,
  header: readonly string[],
  taken: ReadonlySet<number>,
): number | null {
  const hits: number[] = [];
  for (let i = 0; i < header.length; i += 1) {
    const text = header[i];
    if (text === undefined) continue;
    if (!taken.has(i) && sameHeader(text, col.header)) hits.push(i);
  }
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0] ?? null;

  let best = hits[0] ?? 0;
  for (const at of hits) {
    if (Math.abs(at - col.at) < Math.abs(best - col.at)) best = at;
  }
  return best;
}

/**
 * Whether this sheet's headers are the ones the account mapped last time.
 *
 * The question the wizard actually asks: can the map step be skipped? Only
 * when every field the operator mapped is present again. One missing column is
 * enough to send them back, because the missing one might be the rate.
 */
export function headersUnchanged(
  remembered: RememberedMap,
  header: readonly string[],
): boolean {
  const fields = Object.keys(remembered);
  if (fields.length === 0) return false;
  const { changed } = applyRemembered(remembered, header, {});
  return changed.length === 0;
}

/* ── The import as a record ───────────────────────────────────────────────
 *
 * Here rather than in `lib/book.ts` because the memory store needs the same
 * shape, and book.ts already imports the store — putting it there would make
 * the two files import each other for the sake of one interface.
 */

/** How long an import stays undoable. FLOWS 3.3. */
export const UNDO_DAYS = 7;

export interface ImportRecord {
  readonly id: string;
  readonly filename: string;
  readonly status: "committed" | "undone";
  /** The column map the operator accepted, by header text. */
  readonly mapping: RememberedMap;
  /** When it was committed, ISO. */
  readonly at: string;
  /** How many rates it moved, from the summary it recorded. */
  readonly ratesMoved: number;
  /** Whether it is still inside the undo window. */
  readonly undoable: boolean;
}

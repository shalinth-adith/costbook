/**
 * Unit labels a sheet cannot mean.
 *
 * A real workbook labelled 96 of its rows "gm" and wrote quantities of 0.005,
 * 0.12 and 1.5 beside them — five milligrams of turmeric, and a gram and a half
 * of dal. The same ingredients on other rows say "kg" with quantities of the
 * same size and the same rate. The word is a typo; the figures are kilos.
 *
 * Costbook cannot know what turmeric costs, and does not try. What it can know
 * is that a sheet is contradicting itself: if `gm` really meant grams, those
 * quantities would be about a thousand times larger than the ones beside `kg`,
 * and they are not. That is arithmetic, not judgement.
 *
 * It is never resolved silently. The operator is shown the evidence and asked,
 * because the sheet is theirs and either answer is possible — a bakery really
 * might weigh saffron in grams.
 */

import { type UnitFamily, resolveUnit } from './units';

export interface UnitSuspicion {
  /** The unit as the sheet wrote it. */
  readonly wrote: string;
  /** What the figures beside it look like instead. */
  readonly means: string;
  readonly family: UnitFamily;
  readonly rows: number;
  /** Median quantity under the suspect label. */
  readonly median: number;
  /** Median quantity under the unit it is being compared against. */
  readonly against: number;
  /**
   * How far the two differ from what the conversion demands. 1 means the two
   * labels are used for quantities of identical size, which is the clearest
   * possible sign that one of them is wrong.
   */
  readonly ratio: number;
  /** A few real rows, so the operator recognises their own sheet. */
  readonly examples: readonly { readonly row: number; readonly qty: number }[];
}

export interface QuantityRow {
  readonly row: number;
  readonly qty: number | null;
  readonly unit: string | null;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted[mid] ?? 0;
}

/**
 * Below this many rows a difference is noise rather than a pattern. One row
 * written oddly is a row written oddly; ninety-six is a habit.
 */
const ENOUGH_ROWS = 3;

/**
 * How close the two medians have to be before the label is doubted.
 *
 * A gram is a thousandth of a kilo, so grams-quantities should be about a
 * thousand times larger. Anything under this much larger means the labels are
 * being used for quantities of the same size, and one of them is wrong.
 */
const TOO_CLOSE = 20;

export function suspectUnits(rows: readonly QuantityRow[]): readonly UnitSuspicion[] {
  const byUnit = new Map<string, { family: UnitFamily; factor: number; qty: number[]; rows: QuantityRow[] }>();

  for (const r of rows) {
    if (r.unit === null || r.qty === null || r.qty <= 0) continue;
    const def = resolveUnit(r.unit);
    if (def === null) continue;
    const seen = byUnit.get(def.canonical);
    if (seen === undefined) {
      byUnit.set(def.canonical, { family: def.family, factor: def.factor, qty: [r.qty], rows: [r] });
    } else {
      seen.qty.push(r.qty);
      seen.rows.push(r);
    }
  }

  const out: UnitSuspicion[] = [];

  for (const [unit, small] of byUnit) {
    if (small.rows.length < ENOUGH_ROWS) continue;

    for (const [otherUnit, big] of byUnit) {
      if (otherUnit === unit) continue;
      if (big.family !== small.family) continue;
      // Only compare a smaller unit against a larger one.
      if (small.factor >= big.factor) continue;
      if (big.rows.length < ENOUGH_ROWS) continue;

      const expected = big.factor / small.factor;
      const smallMedian = median(small.qty);
      const bigMedian = median(big.qty);
      if (smallMedian <= 0 || bigMedian <= 0) continue;

      /*
       * How much larger the smaller unit's quantities actually are.
       *
       * Grams beside kilos should be about a thousand times larger. When they
       * are the same size — or smaller — the label is not describing the
       * figure next to it.
       */
      const actual = smallMedian / bigMedian;
      if (actual * TOO_CLOSE < expected) {
        out.push({
          wrote: unit,
          means: otherUnit,
          family: small.family,
          rows: small.rows.length,
          median: smallMedian,
          against: bigMedian,
          ratio: actual,
          examples: small.rows
            .slice(0, 4)
            .map((r) => ({ row: r.row, qty: r.qty ?? 0 })),
        });
        // One finding per suspect unit: the operator answers about the label,
        // not about every pair it could be compared with.
        break;
      }
    }
  }

  return out;
}

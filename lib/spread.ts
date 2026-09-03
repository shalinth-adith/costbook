/**
 * How the menu sits against its target.
 *
 * A dashboard that reports only change is empty most of the time, and it was:
 * an owner opens it weekly, rates move monthly, so three weeks in four it had
 * nothing to say. Worse on a freshly imported book, where nothing has moved at
 * all yet and the screen came out as two small boxes and a note.
 *
 * The question a home screen answers is "how am I doing", which is mostly
 * state. So: where the menu sits, which dishes are worst, and what is blocked —
 * with change as one part rather than the whole. None of that is the dish
 * table this screen used to carry. The complaint about that table was never
 * that it showed dishes; it was that it showed *all seventy-nine of them*,
 * which Recipes already did, better.
 */

import type { DashboardRow } from "./dashboard";
import type { TargetStatus } from "./costing";

/** One column of the distribution. */
export interface Band {
  /** Inclusive lower bound, in percentage points. */
  readonly from: number;
  /** Exclusive upper bound. `null` on the last band, which is open-ended. */
  readonly to: number | null;
  readonly count: number;
  /** Whether this band sits entirely past the target. */
  readonly over: boolean;
  /**
   * The band in the product's own three-band vocabulary.
   *
   * `statusFor` calls anything within two points of the target "near", and the
   * whole application already inks on / near / over that way — the chip on a
   * dish, the figure on a row, the glyph beside it. A chart drawn in one
   * undifferentiated grey throws that away and makes the reader work out where
   * healthy stops, which the rest of the product never asks of them.
   *
   * A band that straddles the near window is near: it holds dishes on both
   * sides, so calling it either of the other two would be wrong for half of
   * them.
   */
  readonly status: Exclude<TargetStatus, 'incomplete'>;
  /** Height as a share of the tallest band, 0–100. Zero when nothing costs. */
  readonly height: number;
  /** The dishes in it, so the band can say who without a second pass. */
  readonly names: readonly string[];
}

export interface Spread {
  readonly bands: readonly Band[];
  /** Dishes with a food cost at all. The others cannot be placed. */
  readonly placed: number;
  /** Dishes with no food cost — no rate, or no price. Named, not hidden. */
  readonly unplaced: number;
  /** The median, which says more about a menu than the mean does. */
  readonly median: number | null;
  /** Which band the target falls in, for drawing the line. */
  readonly targetBand: number;
}

/** Five points a band. Ten is too coarse to show a cluster, two is noise. */
const BAND = 5;

/** Everything at or above this goes in one open-ended band at the end. */
const CEILING = 60;

/**
 * Which of the three bands a column belongs to.
 *
 * Read from the column's whole range rather than its midpoint, because a
 * midpoint lands a five-point column on one side of a two-point window by
 * accident. Entirely below the near window is on target; entirely above it is
 * over; anything touching it is near.
 */
function bandStatus(
  from: number,
  to: number | null,
  target: number,
): Exclude<TargetStatus, 'incomplete'> {
  if (from > target + 2) return 'over';
  if (to !== null && to <= target - 2) return 'on';
  return 'near';
}

/**
 * The distribution of food cost across the menu.
 *
 * Deliberately a count of dishes, not a weighted figure. Costbook does not
 * know how much each dish sells — that is a POS integration the product does
 * not have — and a weighted average that quietly assumed equal sales would be
 * a plausible wrong number of exactly the kind this codebase exists to avoid.
 * The average on this screen says so beside itself for the same reason.
 */
export function spread(rows: readonly DashboardRow[], target: number): Spread {
  const costed = rows
    .map((r) => r.foodCostPercent)
    .filter((n): n is number => n !== null);

  const edges: number[] = [];
  for (let n = 0; n < CEILING; n += BAND) edges.push(n);

  const counts = edges.map(() => 0);
  const names: string[][] = edges.map(() => []);

  for (const row of rows) {
    const fc = row.foodCostPercent;
    if (fc === null) continue;
    // Anything past the ceiling lands in the last band rather than off the
    // end of the chart. A dish at 300% is real — it happens when a price is
    // typed into the wrong column — and it must not vanish.
    const at = Math.min(Math.floor(fc / BAND), edges.length - 1);
    counts[at] = (counts[at] ?? 0) + 1;
    names[at]?.push(row.name);
  }

  const tallest = Math.max(...counts, 0);

  const bands: Band[] = edges.map((from, i) => {
    const last = i === edges.length - 1;
    const count = counts[i] ?? 0;
    return {
      from,
      to: last ? null : from + BAND,
      count,
      // A band is "over" only when all of it is past the target, so the band
      // the target sits inside is not painted as a failure.
      over: from >= target,
      status: bandStatus(from, last ? null : from + BAND, target),
      height: tallest === 0 ? 0 : (count / tallest) * 100,
      names: names[i] ?? [],
    };
  });

  return {
    bands,
    placed: costed.length,
    unplaced: rows.length - costed.length,
    median: medianOf(costed),
    targetBand: Math.min(Math.floor(target / BAND), edges.length - 1),
  };
}

/**
 * The middle dish.
 *
 * Reported beside the mean because a menu of eighty cheap tiffin items and
 * four expensive biryanis has a mean nobody's dish is anywhere near. The
 * median is where the menu actually lives.
 */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const low = sorted[mid - 1];
  const high = sorted[mid];
  if (low === undefined || high === undefined) return null;
  return (low + high) / 2;
}

/**
 * The dishes costing most against the target, worst first.
 *
 * Five, not seventy-nine. The whole book is on Recipes, which groups it and
 * searches into its ingredients; this is the shortlist an owner acts on, and
 * a shortlist that runs to eighty rows is a list.
 */
export function worstOffenders(
  rows: readonly DashboardRow[],
  howMany = 5,
): readonly DashboardRow[] {
  return rows
    .filter((r) => r.foodCostPercent !== null)
    .sort(
      (a, b) =>
        (b.foodCostPercent ?? 0) - (a.foodCostPercent ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, howMany);
}

/**
 * Menu engineering, said plainly.
 *
 * Kasavana & Smith (1982): judge every dish by two things, how much it sells
 * and how much money it leaves after its cost. Above or below the menu's
 * average on each gives four groups. The literature calls them stars,
 * plowhorses, puzzles and dogs; an owner does not, so each group here carries
 * the sentence that says what to do about it.
 */

export type Group = 'push' | 'sells_leaves_little' | 'leaves_sells_poorly' | 'neither';

export interface EngineeredDish {
  readonly id: string;
  readonly name: string;
  readonly sold: number;
  /** Price less plate cost, per plate. */
  readonly leaves: number;
  /** sold × leaves: what this dish left in the period. */
  readonly leftTotal: number;
  readonly group: Group;
}

export interface Engineered {
  readonly period: string;
  readonly dishes: readonly EngineeredDish[];
  /** The two lines that split the menu into four. */
  readonly meanSold: number;
  readonly meanLeaves: number;
  readonly leftTotal: number;
  readonly groups: Readonly<Record<Group, readonly EngineeredDish[]>>;
}

export const GROUP_SAID: Readonly<Record<Group, { readonly title: string; readonly doThis: string }>> = {
  push: { title: 'Sells well and leaves money', doThis: 'Push these. Keep them where the eye lands first.' },
  sells_leaves_little: {
    title: 'Sells well but leaves little',
    doThis: 'Raise the price a little or trim the plate. Volume carries a small change.',
  },
  leaves_sells_poorly: {
    title: 'Leaves money but sells poorly',
    doThis: 'Promote, rename, move it up the menu, or pair it in a combo.',
  },
  neither: { title: 'Sells poorly and leaves little', doThis: 'Rework it or take it off.' },
};

/**
 * Only dishes with a price, a complete cost and a sales figure are judged.
 * A dish missing any of the three is left out rather than placed by a guess.
 */
export function engineer(
  period: string,
  rows: readonly { id: string; name: string; sold: number | null; price: number | null; cost: number | null }[],
): Engineered | null {
  const judged = rows.flatMap((r) =>
    r.sold === null || r.price === null || r.cost === null
      ? []
      : [{ id: r.id, name: r.name, sold: r.sold, leaves: r.price - r.cost }],
  );
  if (judged.length < 2) return null;

  const meanSold = judged.reduce((s, d) => s + d.sold, 0) / judged.length;
  // Weighted by what sold, as Kasavana & Smith weight it: the menu's average
  // contribution is the money left per plate across every plate served.
  const totalSold = judged.reduce((s, d) => s + d.sold, 0);
  const meanLeaves =
    totalSold === 0
      ? judged.reduce((s, d) => s + d.leaves, 0) / judged.length
      : judged.reduce((s, d) => s + d.leaves * d.sold, 0) / totalSold;

  const dishes: EngineeredDish[] = judged
    .map((d) => {
      const highSold = d.sold >= meanSold;
      const highLeaves = d.leaves >= meanLeaves;
      const group: Group = highSold
        ? highLeaves ? 'push' : 'sells_leaves_little'
        : highLeaves ? 'leaves_sells_poorly' : 'neither';
      return { ...d, leftTotal: d.sold * d.leaves, group };
    })
    .sort((a, b) => b.leftTotal - a.leftTotal);

  const groups: Record<Group, EngineeredDish[]> = { push: [], sells_leaves_little: [], leaves_sells_poorly: [], neither: [] };
  for (const d of dishes) groups[d.group].push(d);

  return {
    period,
    dishes,
    meanSold,
    meanLeaves,
    leftTotal: dishes.reduce((s, d) => s + d.leftTotal, 0),
    groups,
  };
}

/** `YYYY-MM-01` for the month before `today`. */
export function lastMonth(today: string): string {
  const t = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() - 1);
  return t.toISOString().slice(0, 10);
}

/** "August 2026" for a stored period. */
export function periodSaid(period: string): string {
  return new Date(`${period}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

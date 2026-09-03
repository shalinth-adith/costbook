/**
 * The menu sorted into the four piles an owner actually asks about.
 *
 * The dashboard has been describing cost. An owner asks about the other side
 * of the same subtraction: what do I keep. Cost and margin are the same figure
 * read from opposite ends — a dish spending 34 of every 100 keeps 66 — and
 * "you keep 66" is the sentence somebody nods at.
 *
 * Four piles, because those are the four questions:
 *
 *   earning     dishes keeping more than the operator planned to keep
 *   thin        dishes keeping less — not losses, but less than intended
 *   losing      dishes that cost more than they sell for, which is a real loss
 *   unpriced    dishes that cannot answer, because a rate or a price is absent
 *
 * The fourth is not a rounding error. On the live book it is 56 of 79, and a
 * screen that reported only the other three would describe a quarter of a
 * kitchen as though it were the whole.
 */

import type { DashboardRow } from "./dashboard";

export type Pile = "earning" | "thin" | "losing" | "unpriced";

export interface Standing {
  readonly row: DashboardRow;
  /** What the operator keeps out of every 100 charged. Null when unknown. */
  readonly keeps: number | null;
  /** Money kept on one portion. Null when either figure is absent. */
  readonly keepsMoney: number | null;
  readonly pile: Pile;
}

export interface Piles {
  readonly earning: readonly Standing[];
  readonly thin: readonly Standing[];
  readonly losing: readonly Standing[];
  readonly unpriced: readonly Standing[];
  /** Every dish, so a count never has to be assembled from the four. */
  readonly all: readonly Standing[];
}

/**
 * What one dish keeps.
 *
 * `null` rather than a guess wherever a figure is missing: a dish with no rate
 * reports a floor, and a floor subtracted from a price is not a margin — it is
 * the largest margin the dish could possibly have, which is the most flattering
 * wrong number available.
 */
export function standingOf(row: DashboardRow, target: number): Standing {
  const cost = row.costPerPortion;
  const price = row.sellingPrice;

  /*
   * `gap` is the authority, not the arithmetic.
   *
   * The first version asked only whether the figures were null, and a dish
   * whose every ingredient lacks a rate costs 0.00 — which is not null. It
   * came through as keeping 100 of every 100 and sorted to the very top of
   * "earning what you wanted": Thokku Biryani, costs 0.00, sells at 10.30,
   * keeps AED100. The best-performing dish on the menu, because nobody had
   * costed it.
   *
   * `gap` covers the rows the costing itself knows are short. It did not cover
   * this one: the dish has no ingredient lines at all, so nothing is missing as
   * far as the engine is concerned and it costs exactly 0.00. An empty recipe
   * is not a free dish, it is an uncosted one — so a cost of zero is treated as
   * an unanswered question rather than a perfect margin.
   *
   * That does mean a dish genuinely made of nothing but water would be filed
   * here too. It is the safe direction: this pile is a worklist, and a dish
   * landing on a worklist by mistake costs somebody ten seconds, while a dish
   * landing at the top of "earning what you wanted" by mistake is a lie about
   * the best thing on the menu.
   */
  if (
    row.gap !== 'none' ||
    cost === null ||
    cost === 0 ||
    price === null ||
    price === 0 ||
    row.foodCostPercent === null
  ) {
    return { row, keeps: null, keepsMoney: null, pile: 'unpriced' };
  }

  const keeps = 100 - row.foodCostPercent;
  const keepsMoney = price - cost;

  // Costing more than it sells for. Rare, real, and always worth naming
  // separately — it is not "a thin margin", it is money going out of the door.
  if (keepsMoney < 0) return { row, keeps, keepsMoney, pile: "losing" };

  /*
   * The operator's own line, read from the other end.
   *
   * Aiming to spend 30 is aiming to keep 70. A dish keeping more than that is
   * earning better than planned. The two-point window `statusFor` uses is not
   * applied here: this is a sorting into piles rather than a status on a dish,
   * and a dish one point under the line belongs with the ones to look at.
   */
  return {
    row,
    keeps,
    keepsMoney,
    pile: keeps >= 100 - target ? "earning" : "thin",
  };
}

export function pilesOf(rows: readonly DashboardRow[], target: number): Piles {
  const all = rows.map((r) => standingOf(r, target));

  /** Best first for the good pile, worst first for the ones needing work. */
  const byKeeps = (dir: 1 | -1) => (a: Standing, b: Standing) =>
    dir * ((b.keeps ?? 0) - (a.keeps ?? 0)) ||
    a.row.name.localeCompare(b.row.name);

  return {
    all,
    earning: all.filter((s) => s.pile === "earning").sort(byKeeps(1)),
    thin: all.filter((s) => s.pile === "thin").sort(byKeeps(-1)),
    losing: all.filter((s) => s.pile === "losing").sort(byKeeps(-1)),
    unpriced: all
      .filter((s) => s.pile === "unpriced")
      .sort((a, b) => a.row.name.localeCompare(b.row.name)),
  };
}

/**
 * What a dish is missing, in the operator's words.
 *
 * `gap` already carries this, and it carries it as an enum. This is the same
 * fact said to somebody who did not come here to learn one.
 */
export function missingSaid(row: DashboardRow): string {
  switch (row.gap) {
    case "no_rate":
      return "you have not said what an ingredient in it costs";
    case "no_price":
      return "it has no selling price yet";
    case "no_portions":
      return "it is made by the batch, so there is no per-plate figure";
    case "none":
      return "something is incomplete";
  }
}

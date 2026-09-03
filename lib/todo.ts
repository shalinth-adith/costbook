/**
 * What to do today.
 *
 * The dashboard has reported state: this many earning well, this many thin,
 * this many waiting for a price. An owner reads state and asks the next
 * question every time — "so what do I do?" — and the answer to that question
 * is already computed everywhere in this codebase and shown nowhere on the
 * home screen. `suggestPrice` knows what Koottu should charge. `usageOf` knows
 * which unpriced ingredient unblocks the most dishes. The staleness threshold
 * knows which rate to check. None of it was turned into an instruction.
 *
 * So: every problem, as a sentence with its fix, ranked by how much it is
 * costing right now. A dish sold at a loss first, because that is money going
 * out of the door on every plate. Then thin margins with the price that fixes
 * them. Then the missing rates, as one job — pricing five ingredients is one
 * afternoon, not five separate instructions. Then figures that cannot be
 * right. Then the stale rates, most used first.
 *
 * Pure, and every ranking rule is tested — an owner following this list is
 * acting on the order, so the order has to be right.
 */

import type { Ingredient } from '@/core/ingredient';
import type { Recipe } from '@/core/recipe';

import { type CostingModel, suggestPrice } from './costing';
import type { DashboardRow } from './dashboard';
import type { RateChange } from './org';
import { pilesOf } from './profit';
import { medianOf } from './spread';
import { usageOf } from './usage';

export type Action =
  /** A dish keeping less than planned, and the price that would fix it. */
  | {
      readonly kind: 'raise_price';
      readonly row: DashboardRow;
      readonly from: number;
      readonly to: number;
      /** Kept per 100 now, and after the change. */
      readonly keepsNow: number;
      readonly keepsAfter: number;
      readonly losing: boolean;
    }
  /**
   * Every ingredient with no rate, as one job.
   *
   * The first version listed them one per line and four of six rows on the
   * live book said "Give X a price". An owner sees one task there — price my
   * ingredients — and the repetition pushed a real warning off the bottom of
   * the list. One line, the count, and the one to start with.
   */
  | {
      readonly kind: 'price_ingredients';
      readonly count: number;
      /** The one holding up the most dishes, to start with. */
      readonly first: Ingredient;
      readonly firstUsedIn: number;
      /**
       * Names that are almost certainly free rather than unpriced. Water on a
       * to-do list is a question the owner should not have to answer; the
       * answer is zero, and saying so saves them the visit.
       */
      readonly probablyFree: readonly string[];
    }
  /** A cost per portion so far from the rest of the menu it is probably a typo. */
  | {
      readonly kind: 'check_portions';
      readonly row: DashboardRow;
      readonly costPerPortion: number;
      readonly typical: number;
      readonly times: number;
    }
  /**
   * A rate so far from every other rate it is probably a wrong unit.
   *
   * Maida on the live book: 1.80 a gram, which is 1,800 a kilo, on a shelf
   * where flour is a few dirhams a kilo. A rate typed against the wrong pack
   * size. It passes every validation and it silently inflates every dish it
   * is in — nineteen of them.
   */
  | {
      readonly kind: 'check_rate';
      readonly ingredient: Ingredient;
      /** Price per base unit, as it stands. */
      readonly perUnit: number;
      readonly typical: number;
      readonly times: number;
      readonly usedIn: number;
    }
  /** A rate older than the operator's own threshold, most used first. */
  | {
      readonly kind: 'refresh_rate';
      readonly ingredient: Ingredient;
      readonly days: number;
      readonly usedIn: number;
    };

export interface Todo {
  /** The shortlist, ranked. */
  readonly actions: readonly Action[];
  /**
   * How many there really are. The list is capped and the badge must not
   * pretend the cap is the total — six shown over sixty is a lie about how
   * much work there is.
   */
  readonly total: number;
}

export interface TodoInput {
  readonly rows: readonly DashboardRow[];
  readonly recipes: readonly Recipe[];
  readonly ingredients: readonly Ingredient[];
  readonly history: Readonly<Record<string, readonly RateChange[]>>;
  readonly model: CostingModel;
  readonly staleAfterDays: number;
  /** `YYYY-MM-DD`. Passed in so this stays pure. */
  readonly today: string;
}

/**
 * A cost per portion this many times the menu's median is not a dish, it is a
 * portion count somebody forgot. Butter cookies at 1,729 a portion on a menu
 * whose middle dish costs 0.50 is a batch of cookies costed as one cookie.
 */
const OUTLIER_DISH = 8;

/**
 * Rates vary far more than plate costs — saffron and salt are both real — so
 * the line for a rate is higher. Twenty-five times the median catches a unit
 * typed wrong (a thousandfold) and leaves saffron alone.
 */
const OUTLIER_RATE = 25;

/** How many actions is a list, before it is a backlog. */
const SHOWN = 6;

/** Ingredients that are free in every kitchen, and null only by omission. */
const FREE = /^(water|tap water|ice)$/i;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function todo(input: TodoInput): Todo {
  const piles = pilesOf(input.rows, input.model.foodCostTarget);
  const usage = usageOf(input.recipes);

  const out: Action[] = [];

  /*
   * 1. Money leaving now. Losses first, then thin, each with the price that
   *    hits the target. `suggestPrice` refuses an incomplete dish — a price
   *    built on a floor would be advice to lose money — and these piles hold
   *    only complete ones, so it is safe to ask.
   */
  for (const s of [...piles.losing, ...piles.thin]) {
    const cost = s.row.costPerPortion;
    const price = s.row.sellingPrice;
    if (cost === null || price === null || s.keeps === null) continue;
    const suggestion = suggestPrice(cost, input.model);
    // A suggestion below the current price is not a raise. It happens when
    // rounding lands under the exact figure; leave the dish where it is.
    if (suggestion.rounded <= price) continue;
    out.push({
      kind: 'raise_price',
      row: s.row,
      from: price,
      to: suggestion.rounded,
      keepsNow: s.keeps,
      keepsAfter: 100 - suggestion.roundedFoodCost,
      losing: s.pile === 'losing',
    });
  }

  /*
   * 2. The missing rates, as one job, led by the one that unblocks the most.
   *    An ingredient in no recipe is not on this list: it holds up nothing,
   *    and asking about it is asking about the wrong thing.
   */
  const unpriced = input.ingredients
    .filter((i) => i.purchasePrice === null)
    .map((i) => ({ ingredient: i, usedIn: usage.get(i.id) ?? 0 }))
    .filter((u) => u.usedIn > 0)
    .sort((a, b) => b.usedIn - a.usedIn || a.ingredient.name.localeCompare(b.ingredient.name));
  const lead = unpriced.find((u) => !FREE.test(u.ingredient.name)) ?? unpriced[0];
  if (lead !== undefined) {
    out.push({
      kind: 'price_ingredients',
      count: unpriced.length,
      first: lead.ingredient,
      firstUsedIn: lead.usedIn,
      probablyFree: unpriced
        .filter((u) => FREE.test(u.ingredient.name))
        .map((u) => u.ingredient.name),
    });
  }

  /*
   * 3. Figures that cannot be right. Two kinds.
   *
   *    A cost per portion many times the median is a portion count that was
   *    never entered — the whole batch costed as one plate.
   */
  const costs = input.rows
    .map((r) => r.costPerPortion)
    .filter((n): n is number => n !== null && n > 0);
  const typicalCost = medianOf(costs);
  if (typicalCost !== null && typicalCost > 0) {
    for (const row of input.rows) {
      const c = row.costPerPortion;
      if (c === null) continue;
      const times = c / typicalCost;
      if (times >= OUTLIER_DISH) {
        out.push({ kind: 'check_portions', row, costPerPortion: c, typical: typicalCost, times });
      }
    }
  }

  /*
   *    A rate per unit many times the median of every rate is a pack size
   *    typed wrong. Compared per base unit, because a 50kg sack and a 1kg
   *    packet have very different prices and the same rate.
   */
  const rates = input.ingredients.flatMap((i) =>
    i.purchasePrice === null || i.purchaseQty <= 0
      ? []
      : [{ i, perUnit: i.purchasePrice / i.purchaseQty }],
  );
  const typicalRate = medianOf(rates.map((r) => r.perUnit));
  if (typicalRate !== null && typicalRate > 0) {
    const flagged = rates
      .map((r) => ({ ...r, times: r.perUnit / typicalRate, usedIn: usage.get(r.i.id) ?? 0 }))
      .filter((r) => r.times >= OUTLIER_RATE && r.usedIn > 0)
      .sort((a, b) => b.usedIn - a.usedIn || b.times - a.times);
    for (const r of flagged) {
      out.push({
        kind: 'check_rate',
        ingredient: r.i,
        perUnit: r.perUnit,
        typical: typicalRate,
        times: r.times,
        usedIn: r.usedIn,
      });
    }
  }

  /*
   * 4. Rates the book is trusting on the owner's behalf, most used first.
   *    Only ones with a rate — a stale rate is one that exists and has aged.
   */
  const stale = input.ingredients
    .flatMap((i) => {
      if (i.purchasePrice === null) return [];
      const last = input.history[i.id]?.[0]?.on;
      if (last === undefined) return [];
      const days = daysBetween(last, input.today);
      if (days <= input.staleAfterDays) return [];
      return [{ ingredient: i, days, usedIn: usage.get(i.id) ?? 0 }];
    })
    .filter((s) => s.usedIn > 0)
    .sort((a, b) => b.usedIn - a.usedIn || b.days - a.days);
  for (const s of stale) {
    out.push({ kind: 'refresh_rate', ingredient: s.ingredient, days: s.days, usedIn: s.usedIn });
  }

  return { actions: out.slice(0, SHOWN), total: out.length };
}

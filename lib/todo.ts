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
 * them. Then the missing rate that unblocks the most dishes. Then a figure so
 * far out of line it is almost certainly a typo. Then the stale rates, most
 * used first.
 *
 * Pure, and every ranking rule is tested — an owner following this list is
 * acting on the order, so the order has to be right.
 */

import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";

import { type CostingModel, suggestPrice } from "./costing";
import type { DashboardRow } from "./dashboard";
import type { RateChange } from "./org";
import { pilesOf } from "./profit";
import { medianOf } from "./spread";
import { usageOf } from "./usage";

export type Action =
  /** A dish keeping less than planned, and the price that would fix it. */
  | {
      readonly kind: "raise_price";
      readonly row: DashboardRow;
      readonly from: number;
      readonly to: number;
      /** Kept per 100 now, and after the change. */
      readonly keepsNow: number;
      readonly keepsAfter: number;
      readonly losing: boolean;
    }
  /** An ingredient with no rate, ranked by how many dishes it holds up. */
  | {
      readonly kind: "price_ingredient";
      readonly ingredient: Ingredient;
      readonly usedIn: number;
    }
  /** A cost per portion so far from the rest of the menu it is probably a typo. */
  | {
      readonly kind: "check_portions";
      readonly row: DashboardRow;
      readonly costPerPortion: number;
      readonly typical: number;
      readonly times: number;
    }
  /** A rate older than the operator's own threshold, most used first. */
  | {
      readonly kind: "refresh_rate";
      readonly ingredient: Ingredient;
      readonly days: number;
      readonly usedIn: number;
    };

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
const OUTLIER = 8;

/** How many actions is a list, before it is a backlog. */
const SHOWN = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(from: string, to: string): number {
  return Math.floor(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

export function todo(input: TodoInput): readonly Action[] {
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
      kind: "raise_price",
      row: s.row,
      from: price,
      to: suggestion.rounded,
      keepsNow: s.keeps,
      keepsAfter: 100 - suggestion.roundedFoodCost,
      losing: s.pile === "losing",
    });
  }

  /*
   * 2. The missing rate that unblocks the most. Every unpriced ingredient,
   *    most used first. An ingredient in no recipe is not on this list: it
   *    holds up nothing, and asking about it is asking about the wrong thing.
   */
  const unpriced = input.ingredients
    .filter((i) => i.purchasePrice === null)
    .map((i) => ({ ingredient: i, usedIn: usage.get(i.id) ?? 0 }))
    .filter((u) => u.usedIn > 0)
    .sort(
      (a, b) =>
        b.usedIn - a.usedIn ||
        a.ingredient.name.localeCompare(b.ingredient.name),
    );
  for (const u of unpriced) {
    out.push({
      kind: "price_ingredient",
      ingredient: u.ingredient,
      usedIn: u.usedIn,
    });
  }

  /*
   * 3. Figures that cannot be right. A cost per portion many times the median
   *    is a portion count that was never entered — the whole batch costed as
   *    one plate. Caught here because it passes every validation: it is a
   *    positive number in a numeric field, and it will print on a prep card.
   */
  const costs = input.rows
    .map((r) => r.costPerPortion)
    .filter((n): n is number => n !== null && n > 0);
  const typical = medianOf(costs);
  if (typical !== null && typical > 0) {
    for (const row of input.rows) {
      const c = row.costPerPortion;
      if (c === null) continue;
      const times = c / typical;
      if (times >= OUTLIER) {
        out.push({
          kind: "check_portions",
          row,
          costPerPortion: c,
          typical,
          times,
        });
      }
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
    out.push({
      kind: "refresh_rate",
      ingredient: s.ingredient,
      days: s.days,
      usedIn: s.usedIn,
    });
  }

  return out.slice(0, SHOWN);
}

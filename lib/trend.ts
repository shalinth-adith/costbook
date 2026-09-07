import type { Ingredient } from "@/core/ingredient";
import { type Recipe, pantryOf } from "@/core/recipe";

import type { CostingModel } from "./costing";
import { dashboard } from "./dashboard";
import type { DishMeta } from "./data";
import { monthBefore, shelfAtEndOf } from "./month";
import type { RateChange } from "./org";

/**
 * Plate costs, month by month.
 *
 * The month card answers one month against the one before. This is the same
 * arithmetic run six times, so the dashboard can show the shape of the year
 * rather than one step of it: every rate change carries its date, so the
 * shelf as it stood at the end of any month is today's shelf with the later
 * changes rolled back, and the dishes recosted on it.
 *
 * WHAT IT DOES NOT CLAIM. Recipes are not versioned, so this is what today's
 * dishes would have cost at each month's rates. It isolates what suppliers
 * did. And it totals only dishes costable in every month shown, so a dish
 * that became costable in March does not appear as a March price rise.
 */
export interface TrendMonth {
  readonly period: string;
  /** Total plate cost across the dishes counted. */
  readonly total: number;
}

export interface Trend {
  readonly months: readonly TrendMonth[];
  /** How many dishes the totals are over — costable in every month shown. */
  readonly dishes: number;
  /** Points of movement from the first month to the last. Null when flat or empty. */
  readonly percent: number | null;
}

export interface TrendInput {
  readonly recipes: readonly Recipe[];
  readonly ingredients: readonly Ingredient[];
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly model: CostingModel;
  readonly history: Readonly<Record<string, readonly RateChange[]>>;
  /** The newest month to show, `YYYY-MM`. */
  readonly until: string;
  readonly months?: number;
}

export function trendOf(input: TrendInput): Trend {
  const count = input.months ?? 6;
  const periods: string[] = [];
  let p = input.until;
  for (let i = 0; i < count; i += 1) {
    periods.unshift(p);
    p = monthBefore(p);
  }

  const ids = input.recipes.map((r) => r.id);
  const byMonth = periods.map((period) => {
    const shelf = shelfAtEndOf(period, input.ingredients, input.history);
    const rows = dashboard({
      ids,
      pantry: pantryOf(input.recipes, shelf),
      meta: input.meta,
      model: input.model,
    }).rows;
    return new Map(rows.map((r) => [r.id, r.costPerPortion]));
  });

  // Only dishes with a cost in every month, or a dish arriving part-way
  // through reads as inflation from nothing.
  const counted = ids.filter((id) =>
    byMonth.every((m) => {
      const c = m.get(id);
      return c !== undefined && c !== null && Number.isFinite(c);
    }),
  );

  const months = periods.map((period, i) => ({
    period,
    total: round(
      counted.reduce((sum, id) => sum + (byMonth[i]?.get(id) ?? 0), 0),
    ),
  }));

  const first = months[0]?.total ?? 0;
  const last = months[months.length - 1]?.total ?? 0;
  const percent =
    counted.length === 0 || first === 0 || first === last
      ? null
      : round(((last - first) / first) * 100);

  return { months, dishes: counted.length, percent };
}

const round = (n: number): number => Math.round(n * 100) / 100;

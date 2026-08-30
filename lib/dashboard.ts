/**
 * Every dish, worst food cost first, read against one target line.
 *
 * The sort is the screen's whole argument. An owner opening this has five
 * minutes and one question — what is losing me money — and answering it by
 * alphabetical order would be answering a different question.
 *
 * Two things the design is careful about, and this preserves. A dish whose
 * rate is missing has no food cost at all, so it shows an empty cell rather
 * than a zero and sorts to the bottom rather than to the top; a zero would put
 * the cheapest-looking dishes on a screen that exists to surface the dearest.
 * And a dish with no menu price has no food cost either — that is a different
 * gap from a missing rate, and it says so.
 */

import type { Pantry } from '@/core/recipe';

import { type CostingModel, type TargetStatus, buildUp, foodCostPercent, statusFor, tryRecipeCost } from './costing';
import { type DishMeta } from './data';

/** Pixels per percentage point on the bar. 240px of track shows 60%. */
export const BAR_SCALE = 4;
export const BAR_WIDTH = 240;

export type RowGap = 'none' | 'no_rate' | 'no_portions' | 'no_price';

export interface DashboardRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  /** Null when a rate is missing: the figure would be a floor, not a cost. */
  readonly costPerPortion: number | null;
  readonly sellingPrice: number | null;
  readonly foodCostPercent: number | null;
  readonly status: TargetStatus;
  /** Points against the target. Null when there is no food cost to compare. */
  readonly delta: number | null;
  /** What is missing, if anything. */
  readonly gap: RowGap;
  /** How many of its component lines are other dishes. */
  readonly nestedCount: number;
  /** Bar geometry, in pixels, so the view does no arithmetic. */
  readonly barBase: number;
  readonly barOver: number;
}

export interface DashboardStats {
  readonly costed: number;
  readonly over: number;
  readonly averageFoodCost: number | null;
  readonly missingRate: number;
  /** Made by the batch and never plated, so there is no cost per portion. */
  readonly notPlated: number;
  readonly missingPrice: number;
}

export interface Dashboard {
  readonly rows: readonly DashboardRow[];
  readonly stats: DashboardStats;
  readonly targetPx: number;
}

export interface DashboardInput {
  readonly ids: readonly string[];
  readonly pantry: Pantry;
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly model: CostingModel;
}

export function dashboard(input: DashboardInput): Dashboard {
  const { ids, pantry, meta, model } = input;
  const target = model.foodCostTarget;

  const rows: DashboardRow[] = [];

  for (const id of ids) {
    const recipe = pantry.recipes.get(id);
    const dish = meta[id];
    if (recipe === undefined || dish === undefined) continue;

    // A dish with a line we cannot measure is skipped, not thrown. The board
    // exists to rank a whole menu, and one bad row should cost the operator
    // that row rather than the page.
    const attempt = tryRecipeCost(recipe, pantry);
    if (!attempt.ok) continue;
    const build = buildUp(attempt.cost, model);

    const costPerPortion = build.complete ? build.total : null;
    const fc = costPerPortion === null ? null : foodCostPercent(costPerPortion, dish.sellingPrice);

    const gap: RowGap = !build.complete
      ? 'no_rate'
      : recipe.portions === null
        ? 'no_portions'
        : dish.sellingPrice === null
          ? 'no_price'
          : 'none';

    rows.push({
      id,
      name: recipe.name,
      category: dish.category,
      costPerPortion,
      sellingPrice: dish.sellingPrice,
      foodCostPercent: fc,
      status: statusFor(fc, target),
      delta: fc === null ? null : fc - target,
      gap,
      nestedCount: recipe.components.filter((c) => c.kind === 'recipe').length,
      // The bar stops at the target; anything beyond it is drawn as overshoot,
      // hatched, so the excess is visible as a quantity rather than a colour.
      barBase: fc === null ? 0 : Math.min(fc, target) * BAR_SCALE,
      barOver: fc === null ? 0 : Math.max(0, fc - target) * BAR_SCALE,
    });
  }

  // Worst first. Rows with no food cost sort to the bottom — they are not
  // cheap, they are unknown, and putting them at the top of a worst-first list
  // would be answering the wrong question.
  rows.sort((a, b) => {
    if (a.foodCostPercent === null && b.foodCostPercent === null) return a.name.localeCompare(b.name);
    if (a.foodCostPercent === null) return 1;
    if (b.foodCostPercent === null) return -1;
    return b.foodCostPercent - a.foodCostPercent;
  });

  const known = rows.filter((r) => r.foodCostPercent !== null);

  return {
    rows,
    stats: {
      costed: rows.length,
      over: rows.filter((r) => r.status === 'over').length,
      averageFoodCost:
        known.length === 0
          ? null
          : known.reduce((sum, r) => sum + (r.foodCostPercent ?? 0), 0) / known.length,
      missingRate: rows.filter((r) => r.gap === 'no_rate').length,
      notPlated: rows.filter((r) => r.gap === 'no_portions').length,
      missingPrice: rows.filter((r) => r.gap === 'no_price').length,
    },
    targetPx: target * BAR_SCALE,
  };
}

export type DashboardFilter = 'all' | 'over' | 'incomplete';

export function applyFilter(
  rows: readonly DashboardRow[],
  filter: DashboardFilter,
  query: string,
  category: string,
): readonly DashboardRow[] {
  const q = query.trim().toLowerCase();

  return rows.filter((r) => {
    if (filter === 'over' && r.status !== 'over') return false;
    if (filter === 'incomplete' && r.gap === 'none') return false;
    if (category !== 'all' && r.category !== category) return false;
    if (q !== '' && !r.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export function categoriesOf(rows: readonly DashboardRow[]): readonly string[] {
  return [...new Set(rows.map((r) => r.category))].sort();
}

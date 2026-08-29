/**
 * The recipe library.
 *
 * Sorted for retrieval rather than consequence. The dashboard sorts by food
 * cost, worst first, because it is opened to answer what is wrong today; this
 * screen groups by category because it is opened to find one thing. Neither
 * sort would serve the other screen (A16).
 */

import { ingredientCost } from '@/core/ingredient';
import { type Pantry, isComplete, recipeCost } from '@/core/recipe';

import { type CostingModel, type TargetStatus, buildUp, foodCostPercent, statusFor } from './costing';
import type { DishMeta } from './data';

/**
 * Which half of the library a recipe belongs to.
 *
 * A recipe with a portion count is a dish; one made by the kilo or the piece
 * and never plated is a batch. TRD 5 already draws that line — portions is
 * null for a pure sub-recipe — and it is the line the columns need: a batch is
 * compared by what one unit of it costs, which is the figure you look at when
 * linking it into something else.
 */
export type LibraryKind = 'dish' | 'batch';

export type LibraryFilter = 'all' | 'on_menu' | 'incomplete' | 'over' | 'archived';

export interface LibraryRow {
  readonly id: string;
  readonly kind: LibraryKind;
  readonly name: string;
  readonly category: string;
  /** What the row says under its name — yield for a batch, portioning for a dish. */
  readonly note: string;
  readonly componentCount: number;
  /** Cost per portion for a dish; null when a rate is missing. */
  readonly costPerPortion: number | null;
  /** Cost of one unit of output, for a batch. */
  readonly costPerUnit: number | null;
  readonly outputUnit: string;
  readonly sellingPrice: number | null;
  readonly foodCostPercent: number | null;
  readonly status: TargetStatus;
  readonly complete: boolean;
  readonly archived: boolean;
  /** How many recipes link to this one. */
  readonly usedIn: number;
  readonly updatedAt: string | null;
  /**
   * Why this row is in a search result. Named on the row, because a dish
   * appearing because of an ingredient three levels down is otherwise a
   * mystery (A16).
   */
  readonly matchedOn: string | null;
}

export interface LibraryGroup {
  readonly category: string;
  readonly rows: readonly LibraryRow[];
}

export interface Library {
  readonly dishes: readonly LibraryRow[];
  readonly batches: readonly LibraryRow[];
  readonly dishCount: number;
  readonly batchCount: number;
}

export interface LibraryInput {
  readonly ids: readonly string[];
  readonly pantry: Pantry;
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly model: CostingModel;
}

/** Every ingredient name a recipe reaches, directly or through a sub-recipe. */
function ingredientNames(id: string, pantry: Pantry, seen = new Set<string>()): readonly string[] {
  if (seen.has(id)) return [];
  seen.add(id);

  const recipe = pantry.recipes.get(id);
  if (recipe === undefined) return [];

  const names: string[] = [];
  for (const c of recipe.components) {
    if (c.kind === 'ingredient') {
      const ingredient = pantry.ingredients.get(c.ingredientId);
      if (ingredient !== undefined) names.push(ingredient.name);
    } else if (c.kind === 'recipe') {
      names.push(...ingredientNames(c.childId, pantry, seen));
    }
  }
  return names;
}

export function library(input: LibraryInput): Library {
  const { ids, pantry, meta, model } = input;

  const usedCounts = new Map<string, number>();
  for (const recipe of pantry.recipes.values()) {
    for (const c of recipe.components) {
      if (c.kind === 'recipe') usedCounts.set(c.childId, (usedCounts.get(c.childId) ?? 0) + 1);
    }
  }

  const rows: LibraryRow[] = [];

  for (const id of ids) {
    const recipe = pantry.recipes.get(id);
    const dish = meta[id];
    if (recipe === undefined || dish === undefined) continue;

    const cost = recipeCost(recipe, pantry);
    const build = buildUp(cost, model);
    const complete = isComplete(cost);
    const kind: LibraryKind = recipe.portions === null ? 'batch' : 'dish';

    const costPerPortion = complete ? build.total : null;
    const fc = costPerPortion === null ? null : foodCostPercent(costPerPortion, dish.sellingPrice);

    rows.push({
      id,
      kind,
      name: recipe.name,
      category: kind === 'batch' ? 'Batches' : dish.category,
      note:
        kind === 'batch'
          ? `yields ${recipe.outputQty / baseFactor(recipe.outputUnit)} ${recipe.outputUnit}`
          : `${String(recipe.portions)} ${recipe.portions === 1 ? 'portion' : 'portions'} a batch`,
      componentCount: recipe.components.length,
      costPerPortion,
      costPerUnit: complete ? build.perBaseUnit * baseFactor(recipe.outputUnit) : null,
      outputUnit: recipe.outputUnit,
      sellingPrice: dish.sellingPrice,
      foodCostPercent: fc,
      status: statusFor(fc, model.foodCostTarget),
      complete,
      archived: dish.archived === true,
      usedIn: usedCounts.get(id) ?? 0,
      updatedAt: dish.updatedAt ?? null,
      matchedOn: null,
    });
  }

  return {
    dishes: rows.filter((r) => r.kind === 'dish'),
    batches: rows.filter((r) => r.kind === 'batch'),
    dishCount: rows.filter((r) => r.kind === 'dish' && !r.archived).length,
    batchCount: rows.filter((r) => r.kind === 'batch' && !r.archived).length,
  };
}

function baseFactor(unit: string): number {
  const table: Record<string, number> = { g: 1, kg: 1000, mg: 0.001, ml: 1, l: 1000, pcs: 1, pc: 1, nos: 1 };
  return table[unit] ?? 1;
}

export interface SearchOutcome {
  readonly rows: readonly LibraryRow[];
  /** How many matched by name, and how many only by an ingredient inside them. */
  readonly byName: number;
  readonly byIngredient: number;
}

/**
 * Search reaches into ingredients.
 *
 * Which dishes use an ingredient is the question an owner asks the hour its
 * rate spikes, so typing "cashew" surfaces every dish containing one — and the
 * matched ingredient is named on the row, because otherwise a dish appearing
 * for a reason three levels down is a mystery (A16).
 */
export function search(
  rows: readonly LibraryRow[],
  query: string,
  pantry: Pantry,
): SearchOutcome {
  const q = query.trim().toLowerCase();
  if (q === '') return { rows, byName: 0, byIngredient: 0 };

  let byName = 0;
  let byIngredient = 0;
  const matched: LibraryRow[] = [];

  for (const row of rows) {
    if (row.name.toLowerCase().includes(q)) {
      byName += 1;
      matched.push({ ...row, matchedOn: null });
      continue;
    }

    const hit = ingredientNames(row.id, pantry).find((n) => n.toLowerCase().includes(q));
    if (hit !== undefined) {
      byIngredient += 1;
      matched.push({ ...row, matchedOn: hit });
    }
  }

  return { rows: matched, byName, byIngredient };
}

export function applyLibraryFilter(
  rows: readonly LibraryRow[],
  filter: LibraryFilter,
): readonly LibraryRow[] {
  // Archived is the only filter that shows archived rows. Everywhere else they
  // are out of the way but not gone (FLOWS 4).
  if (filter === 'archived') return rows.filter((r) => r.archived);

  const live = rows.filter((r) => !r.archived);
  switch (filter) {
    case 'on_menu':
      return live.filter((r) => r.sellingPrice !== null);
    case 'incomplete':
      return live.filter((r) => !r.complete);
    case 'over':
      return live.filter((r) => r.status === 'over');
    case 'all':
      return live;
  }
}

/** Grouped by category, in the order a menu reads. */
export function groupByCategory(rows: readonly LibraryRow[]): readonly LibraryGroup[] {
  const groups = new Map<string, LibraryRow[]>();
  for (const row of rows) {
    const list = groups.get(row.category) ?? [];
    list.push(row);
    groups.set(row.category, list);
  }

  return [...groups.entries()]
    .map(([category, list]) => ({
      category,
      rows: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** The sentence above the results, saying why each row is there. */
export function describeMatch(outcome: SearchOutcome, kindLabel: string): string {
  const total = outcome.rows.length;
  const parts: string[] = [];
  if (outcome.byName > 0) parts.push(`${outcome.byName} by name`);
  if (outcome.byIngredient > 0) parts.push(`${outcome.byIngredient} by an ingredient in them`);

  return `${total} ${total === 1 ? kindLabel : `${kindLabel}s`} — ${parts.join(', ')}`;
}

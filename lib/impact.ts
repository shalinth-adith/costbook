/**
 * What a change would do, before it is made (A24, A25, A27).
 *
 * One computation, reached from two ends. An ingredient's rate moves and the
 * operator wants to know which dishes follow; a target moves in Settings and
 * they want the same answer about the same dishes. The design says so outright
 * — Settings' blast radius is "the same panel you get when an ingredient's rate
 * moves, because this is the same event seen from the other end."
 *
 * Nothing here writes. It costs the menu twice, once as it stands and once
 * under the proposed change, and diffs the two. That is what lets the panel
 * open before anything is committed, which is the whole point of it.
 */

import type { Ingredient } from '@/core/ingredient';
import { type Pantry, type Recipe, pantryOf, recipeCost } from '@/core/recipe';

import { modelForDish, type CostingModel, buildUp, foodCostPercent } from './costing';
import type { DishMeta } from './data';

export interface Movement {
  readonly id: string;
  readonly name: string;
  readonly oldCost: number | null;
  readonly newCost: number | null;
  readonly costDelta: number;
  readonly oldFoodCost: number | null;
  readonly newFoodCost: number | null;
  /** Points of food cost. Null when either side has no price to measure. */
  readonly foodCostDelta: number | null;
  /** Was at or under target, is now over. The three rows worth reading. */
  readonly crosses: boolean;
  /**
   * The sub-recipe this dish reaches the change through, if it does not list it
   * directly. Six of eleven dishes reach onion through a gravy — that is the
   * connection nobody holds in their head, and the reason the panel exists.
   */
  readonly via: string | null;
}

export interface Impact {
  /** Every dish whose cost actually moved, crossers first then by size. */
  readonly moved: readonly Movement[];
  readonly crossing: readonly Movement[];
  readonly notCrossing: readonly Movement[];
  readonly crossCount: number;
}

/** Below this a movement is rounding, not news. */
const EPSILON = 0.005;

/**
 * The shortest path from a dish to the ingredient, named by its first hop.
 *
 * Returns null when the dish lists the ingredient itself — there is no "via"
 * to report, and saying "via" of a direct line would be wrong.
 */
export function pathTo(
  recipe: Recipe,
  ingredientId: string,
  pantry: Pantry,
  seen = new Set<string>(),
): string | null {
  if (seen.has(recipe.id)) return null;
  seen.add(recipe.id);

  for (const c of recipe.components) {
    if (c.kind === 'ingredient' && c.ingredientId === ingredientId) return null;
  }

  for (const c of recipe.components) {
    if (c.kind !== 'recipe') continue;
    const child = pantry.recipes.get(c.childId);
    if (child === undefined) continue;
    if (reaches(child, ingredientId, pantry, new Set(seen))) return child.name;
  }

  return null;
}

function reaches(
  recipe: Recipe,
  ingredientId: string,
  pantry: Pantry,
  seen = new Set<string>(),
): boolean {
  if (seen.has(recipe.id)) return false;
  seen.add(recipe.id);
  return recipe.components.some((c) => {
    if (c.kind === 'ingredient') return c.ingredientId === ingredientId;
    if (c.kind === 'recipe') {
      const child = pantry.recipes.get(c.childId);
      return child !== undefined && reaches(child, ingredientId, pantry, seen);
    }
    return false;
  });
}

interface Snapshot {
  readonly cost: number | null;
  readonly foodCost: number | null;
}

function snap(
  recipe: Recipe,
  pantry: Pantry,
  meta: DishMeta | undefined,
  model: CostingModel,
): Snapshot {
  const own = modelForDish(model, meta?.pricing);
  const build = buildUp(recipeCost(recipe, pantry), own, { labourMinutes: meta?.pricing?.labourMinutes });
  const cost = build.complete ? build.total : null;
  const price = meta?.sellingPrice ?? null;
  return { cost, foodCost: cost === null ? null : foodCostPercent(cost, price, own) };
}

export interface ImpactInput {
  readonly recipes: readonly Recipe[];
  readonly ingredients: readonly Ingredient[];
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly model: CostingModel;
  /** The proposed change. Either an ingredient's rate, or the model, or both. */
  readonly nextIngredients?: readonly Ingredient[] | undefined;
  readonly nextModel?: CostingModel | undefined;
  /** Names the "via" column. Omitted for a model change, which has no path. */
  readonly ingredientId?: string | undefined;
}

export function impactOf(input: ImpactInput): Impact {
  const { recipes, ingredients, meta, model, ingredientId } = input;

  const before = pantryOf(recipes, ingredients);
  const after = pantryOf(recipes, input.nextIngredients ?? ingredients);
  const nextModel = input.nextModel ?? model;

  const target = nextModel.foodCostTarget;
  const oldTarget = model.foodCostTarget;

  const moved: Movement[] = [];

  for (const recipe of recipes) {
    const dish = meta[recipe.id];
    const was = snap(recipe, before, dish, model);
    const now = snap(recipe, after, dish, nextModel);

    const costDelta = (now.cost ?? 0) - (was.cost ?? 0);
    const fcMoved =
      was.foodCost !== null && now.foodCost !== null && Math.abs(now.foodCost - was.foodCost) > EPSILON;

    // A target change moves no cost at all — it moves the line the cost is read
    // against. Both count as movement, or Settings' panel would be empty.
    const targetMoved = Math.abs(target - oldTarget) > EPSILON;
    if (Math.abs(costDelta) <= EPSILON && !fcMoved && !targetMoved) continue;
    if (was.cost === null && now.cost === null) continue;

    const wasOver = was.foodCost !== null && was.foodCost > oldTarget;
    const isOver = now.foodCost !== null && now.foodCost > target;

    moved.push({
      id: recipe.id,
      name: recipe.name,
      oldCost: was.cost,
      newCost: now.cost,
      costDelta,
      oldFoodCost: was.foodCost,
      newFoodCost: now.foodCost,
      foodCostDelta:
        was.foodCost === null || now.foodCost === null ? null : now.foodCost - was.foodCost,
      crosses: !wasOver && isOver,
      via: ingredientId === undefined ? null : pathTo(recipe, ingredientId, after),
    });
  }

  // Crossers first, then by size of movement. There is no alphabetical option:
  // a list of eleven dishes sorted by name is a list you have to read, and the
  // point of the panel is that you don't.
  const bySize = (a: Movement, b: Movement) =>
    Math.abs(b.foodCostDelta ?? b.costDelta) - Math.abs(a.foodCostDelta ?? a.costDelta);

  const crossing = moved.filter((m) => m.crosses).sort(bySize);
  const notCrossing = moved.filter((m) => !m.crosses).sort(bySize);

  return {
    moved: [...crossing, ...notCrossing],
    crossing,
    notCrossing,
    crossCount: crossing.length,
  };
}

/**
 * The headline above the list.
 *
 * "Nothing moves" is good news and reads as such — an empty panel with a bare
 * "0 dishes affected" makes a fine outcome feel like a failed search.
 */
export function headlineFor(impact: Impact, target: number): string {
  const n = impact.moved.length;
  if (n === 0) return 'No dish changes price.';
  const dishes = `${n} ${n === 1 ? 'dish' : 'dishes'}`;
  if (impact.crossCount === 0) return `${dishes} move. None cross your ${target.toFixed(1)}% target.`;
  return `${dishes} move. ${impact.crossCount} cross your ${target.toFixed(1)}% target.`;
}

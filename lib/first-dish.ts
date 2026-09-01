/**
 * Where "start with one dish" lands (A42).
 *
 * The setup wizard's quiet door was a real door with nothing behind it. This
 * is that destination, in three states: nothing costed yet, one dish in, and
 * the moment a rate moves it.
 *
 * The third is the whole argument. Someone who costs one dish by hand has seen
 * a calculator, not a product; the moment ghee moves and their dosa follows
 * without them touching it is the first time this differs from a spreadsheet,
 * and on a menu of one it fits in a single line.
 *
 * Per A35 there are no zeros here — no stat card reading 0, no chart frame
 * with no chart in it. A state with nothing to report says a sentence instead.
 */

import type { Ingredient } from '@/core/ingredient';
import { type Pantry, type Recipe, recipeCost } from '@/core/recipe';

import type { CostingModel } from './costing';
import { foodCostPercent } from './costing';
import type { DishMeta } from './data';
import type { RateChange } from './org';
import { movements } from './rates';

/** The dish, once there is exactly one and it costs. */
export interface FirstDishRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly components: number;
  readonly costPerPortion: number;
  readonly sellingPrice: number | null;
  readonly foodCostPercent: number | null;
}

/** What moved, and what it did to the dish. */
export interface RateMove {
  readonly ingredient: string;
  /** ISO date of the change. */
  readonly on: string;
  readonly from: number;
  readonly to: number;
  /**
   * Whether the rate per unit went up.
   *
   * Not read off the pack prices: a supplier moving from a 500g tin at 300 to
   * a 1kg tin at 500 raised the price and lowered the rate, and the sentence
   * has to say which one happened to the dish.
   */
  readonly rose: boolean;
  /** The dish's food cost before the move, so "was" is computed, not stored. */
  readonly wasFoodCostPercent: number | null;
}

export type FirstDish =
  /** Nothing costed. One sentence, one action. */
  | { readonly kind: 'none' }
  /** One dish costed, and nothing has happened to it since. */
  | { readonly kind: 'one'; readonly dish: FirstDishRow; readonly ingredients: number }
  /** One dish costed, and a rate moved it after it was last edited. */
  | {
      readonly kind: 'moved';
      readonly dish: FirstDishRow;
      readonly ingredients: number;
      readonly move: RateMove;
    };

export interface FirstDishInput {
  readonly recipes: readonly Recipe[];
  readonly pantry: Pantry;
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly model: CostingModel;
  /** Rate history by ingredient id, as `book()` returns it. */
  readonly history: Readonly<Record<string, readonly RateChange[]>>;
  readonly ingredientCount: number;
}

/**
 * Which of A42's three states this account is in.
 *
 * Returns null once there is more than one costed dish — from there the
 * ordinary dashboard (A2) has a sort order worth reading, which is its whole
 * argument, and this screen has nothing left to teach.
 */
export function firstDish(input: FirstDishInput): FirstDish | null {
  const { recipes, pantry, meta, model, history, ingredientCount } = input;

  const costed: { recipe: Recipe; perPortion: number }[] = [];
  for (const r of recipes) {
    const cost = costOf(r, pantry);
    // A floor is not a cost. A dish missing a rate has not been costed, so it
    // does not move this screen off its first state — there is still nothing
    // here that answers "what does it cost".
    if (cost !== null) costed.push({ recipe: r, perPortion: cost });
  }

  if (costed.length === 0) return { kind: 'none' };
  if (costed.length > 1) return null;

  const only = costed[0];
  if (only === undefined) return { kind: 'none' };

  const dish = rowFor(only.recipe, only.perPortion, meta[only.recipe.id]);
  const move = latestMove(only.recipe, pantry, meta[only.recipe.id], model, history);

  return move === null
    ? { kind: 'one', dish, ingredients: ingredientCount }
    : { kind: 'moved', dish, ingredients: ingredientCount, move };
}

/**
 * The rate movement that is the newest thing to have happened to this dish.
 *
 * No time window, deliberately. A rate that moved on Friday is still the last
 * thing that happened to a dish nobody touched over the weekend, and it should
 * read that way on Monday — anything else needs a rule about when the day
 * turns over, and that rule is always wrong somewhere and never remembered.
 *
 * The dish's own last edit is what ends it: once the operator has changed the
 * dish themselves, the movement is no longer news, it is history.
 */
function latestMove(
  recipe: Recipe,
  pantry: Pantry,
  meta: DishMeta | undefined,
  model: CostingModel,
  history: Readonly<Record<string, readonly RateChange[]>>,
): RateMove | null {
  let newest: { change: RateChange; ingredient: Ingredient } | null = null;

  for (const id of ingredientIds(recipe, pantry)) {
    const ingredient = pantry.ingredients.get(id);
    if (ingredient === undefined) continue;
    for (const change of movements(history[id] ?? [])) {
      if (change.from === null) continue; // the first rate is not a movement in
      if (newest === null || change.on > newest.change.on) newest = { change, ingredient };
    }
  }
  if (newest === null) return null;

  // Anything the operator did to the dish afterwards makes this old news.
  const touched = meta?.updatedAt;
  if (touched !== undefined && touched.slice(0, 10) > newest.change.on) return null;

  const from = newest.change.from;
  if (from === null) return null;

  const wasRate = from / newest.change.qty;
  const nowRate = newest.change.to / newest.ingredient.purchaseQty;

  return {
    ingredient: newest.ingredient.name,
    on: newest.change.on,
    from,
    to: newest.change.to,
    rose: nowRate > wasRate,
    wasFoodCostPercent: foodCostAt(
      recipe, pantry, newest.ingredient, { price: from, qty: newest.change.qty }, meta, model,
    ),
  };
}

/** The dish's food cost as it stood before this rate moved. */
function foodCostAt(
  recipe: Recipe,
  pantry: Pantry,
  ingredient: Ingredient,
  was: { readonly price: number; readonly qty: number },
  meta: DishMeta | undefined,
  model: CostingModel,
): number | null {
  const price = meta?.sellingPrice ?? null;
  if (price === null || price <= 0) return null;

  const before: Pantry = {
    recipes: pantry.recipes,
    ingredients: new Map(pantry.ingredients).set(ingredient.id, {
      ...ingredient,
      purchasePrice: was.price,
      purchaseQty: was.qty,
    }),
  };
  const perPortion = costOf(recipe, before);
  if (perPortion === null) return null;
  return foodCostPercent(withModel(perPortion, model), price);
}

/** Cost per portion, or null where the dish reports a floor. */
function costOf(recipe: Recipe, pantry: Pantry): number | null {
  try {
    const cost = recipeCost(recipe, pantry);
    if (cost.kind !== 'cost') return null;
    return cost.perPortion;
  } catch {
    // A line the engine cannot measure is not a costed dish. It is also not a
    // reason for the page to fall over.
    return null;
  }
}

/** Wastage and packaging, the same way the cost sheet applies them. */
function withModel(perPortion: number, model: CostingModel): number {
  return perPortion * (1 + model.wastagePercent / 100) + model.packagingPerPortion;
}

function rowFor(recipe: Recipe, perPortion: number, meta: DishMeta | undefined): FirstDishRow {
  const price = meta?.sellingPrice ?? null;
  const total = perPortion;
  return {
    id: recipe.id,
    name: recipe.name,
    category: meta?.category ?? '',
    components: recipe.components.length,
    costPerPortion: total,
    sellingPrice: price,
    foodCostPercent: price === null || price <= 0 ? null : foodCostPercent(total, price),
  };
}

/** Every ingredient this dish reaches, through however many sub-recipes. */
function ingredientIds(recipe: Recipe, pantry: Pantry, seen = new Set<string>()): Set<string> {
  const out = new Set<string>();
  if (seen.has(recipe.id)) return out;
  seen.add(recipe.id);

  for (const c of recipe.components) {
    if (c.kind === 'ingredient') out.add(c.ingredientId);
    else if (c.kind === 'recipe') {
      const sub = pantry.recipes.get(c.childId);
      if (sub !== undefined) for (const id of ingredientIds(sub, pantry, seen)) out.add(id);
    }
  }
  return out;
}

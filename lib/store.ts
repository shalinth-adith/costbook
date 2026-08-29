/**
 * Where edits live until there is a database.
 *
 * A module-level store on the server, seeded from the fixtures. It is real
 * persistence in the sense that matters for the screens — save a dish and the
 * dashboard shows it, at its true rank, on the next request — and it is lost
 * when the server restarts. Supabase replaces this at build step 12, and the
 * shape is deliberately what a route handler will hand over then: plain lists
 * in, a Pantry out (TRD 2).
 *
 * Nothing here computes a cost. It stores what the operator entered and hands
 * it to `core/` to be costed, every time, from current data.
 */

import { isKnownCurrency } from '@/core/currency';
import type { Ingredient } from '@/core/ingredient';
import { type Pantry, type Recipe, pantryOf } from '@/core/recipe';

import { DEFAULT_MODEL } from './costing';
import { ORG, type DishMeta, meta as seedMeta, recipes as seedRecipes, shelf as seedShelf } from './data';

interface State {
  recipes: Recipe[];
  ingredients: Ingredient[];
  meta: Record<string, DishMeta>;
  currency: string;
  /**
   * The figures every new dish starts from. Wastage is a share and survives a
   * currency change untouched; packaging is an amount, which makes it money,
   * which means it converts like every other amount.
   */
  wastagePercent: number;
  packagingPerPortion: number;
}

/**
 * Held on `globalThis` so the dev server's module reloading does not quietly
 * discard someone's work between requests.
 */
const KEY = Symbol.for('costbook.store');

interface Holder {
  [KEY]?: State;
}

function state(): State {
  const holder = globalThis as unknown as Holder;
  holder[KEY] ??= {
    recipes: [...seedRecipes],
    ingredients: [...seedShelf],
    meta: { ...seedMeta },
    currency: ORG.currencyCode,
    wastagePercent: DEFAULT_MODEL.wastagePercent,
    packagingPerPortion: DEFAULT_MODEL.packagingPerPortion,
  };
  return holder[KEY];
}

export function pantry(): Pantry {
  const s = state();
  return pantryOf(s.recipes, s.ingredients);
}

export function allRecipes(): readonly Recipe[] {
  return state().recipes;
}

export function allIngredients(): readonly Ingredient[] {
  return state().ingredients;
}

export function allMeta(): Readonly<Record<string, DishMeta>> {
  return state().meta;
}

export function getRecipe(id: string): Recipe | undefined {
  return state().recipes.find((r) => r.id === id);
}

export function getMeta(id: string): DishMeta | undefined {
  return state().meta[id];
}

/** Replace a recipe wholesale. The client sends what it has; this is the write. */
export function putRecipe(recipe: Recipe): void {
  const s = state();
  const at = s.recipes.findIndex((r) => r.id === recipe.id);
  if (at === -1) s.recipes.push(recipe);
  else s.recipes[at] = recipe;
}

export function putMeta(id: string, patch: Partial<DishMeta>): void {
  const s = state();
  const current = s.meta[id];
  if (current === undefined) return;
  s.meta[id] = { ...current, ...patch };
}

/**
 * Give an ingredient a rate.
 *
 * One ingredient, referenced by every line that uses it, so this is the whole
 * of the write — nothing downstream is stored, and every dish recosts from it
 * on the next read (FLOWS 6).
 */
export function putIngredient(ingredient: Ingredient): void {
  const s = state();
  const at = s.ingredients.findIndex((i) => i.id === ingredient.id);
  if (at === -1) s.ingredients.push(ingredient);
  else s.ingredients[at] = ingredient;
}

/** How many recipes reach an ingredient, directly or through a sub-recipe. */
export function recipesUsing(ingredientId: string): readonly Recipe[] {
  const s = state();
  const byId = new Map(s.recipes.map((r) => [r.id, r]));

  const reaches = (recipe: Recipe, seen = new Set<string>()): boolean => {
    if (seen.has(recipe.id)) return false;
    seen.add(recipe.id);
    return recipe.components.some((c) => {
      if (c.kind === 'ingredient') return c.ingredientId === ingredientId;
      if (c.kind === 'recipe') {
        const child = byId.get(c.childId);
        return child !== undefined && reaches(child, seen);
      }
      return false;
    });
  };

  return s.recipes.filter((r) => reaches(r));
}

/** Undo support: the sheet sends back what it had, and this puts it back. */
export function restore(recipe: Recipe, dishMeta: DishMeta | undefined): void {
  putRecipe(recipe);
  if (dishMeta !== undefined) state().meta[recipe.id] = dishMeta;
}

export function currencyCode(): string {
  return state().currency;
}

/** The costing model as it stands, in the account's own currency. */
export function orgModel(): { wastagePercent: number; packagingPerPortion: number } {
  const s = state();
  return { wastagePercent: s.wastagePercent, packagingPerPortion: s.packagingPerPortion };
}

export function setOrgModel(patch: {
  wastagePercent?: number;
  packagingPerPortion?: number;
}): void {
  const s = state();
  if (patch.wastagePercent !== undefined) s.wastagePercent = patch.wastagePercent;
  if (patch.packagingPerPortion !== undefined) s.packagingPerPortion = patch.packagingPerPortion;
}

/**
 * Whether the currency can still be chosen.
 *
 * Once a dish exists, every rate on it was typed in the currency in force at
 * the time. Changing the label afterwards would not change those figures, so
 * the account would be holding one currency's rates under another's symbol —
 * which is a worse number than any it was meant to fix.
 *
 * Moving an account between currencies for real means converting every rate
 * at a figure the operator supplies, and that is a separate feature.
 */
export function currencyIsSettable(): boolean {
  return state().recipes.length === 0;
}

/**
 * Set the currency the account prices in.
 *
 * Only before there is anything priced. Nothing is converted, because nothing
 * has been entered yet — which is exactly why this is the moment to ask.
 */
export function setCurrency(code: string): void {
  if (!isKnownCurrency(code)) return;
  if (!currencyIsSettable()) return;
  state().currency = code.toUpperCase();
}

/** Empty the account, so setup can be walked through again. */
export function clearBook(): void {
  const s = state();
  s.recipes = [];
  s.ingredients = [];
  s.meta = {};
}

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

import { type Conversion, assertConvertible, convert, convertOptional } from '@/core/currency';
import type { Ingredient } from '@/core/ingredient';
import { type Pantry, type Recipe, pantryOf } from '@/core/recipe';

import { DEFAULT_MODEL } from './costing';
import { ORG, type DishMeta, meta as seedMeta, recipes as seedRecipes, shelf as seedShelf } from './data';

/** What the account was converted from, and at what rate. */
export interface ConversionRecord {
  readonly from: string;
  readonly to: string;
  readonly rate: number;
  readonly at: string;
}

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
  /** Every switch, newest first. A figure nobody can trace is a figure nobody trusts. */
  conversions: ConversionRecord[];
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
    conversions: [],
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

export function conversionHistory(): readonly ConversionRecord[] {
  return state().conversions;
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
 * Move the whole account into another currency.
 *
 * Every rate the operator entered, and every menu price, converts by the rate
 * they supplied. Nothing is looked up and nothing is left behind at the old
 * figure — an account holding rupee rates with a dirham symbol on them has not
 * changed currency, it has silently multiplied its whole menu by about 23.
 *
 * The conversion is recorded. A figure that changed for a reason nobody can
 * trace is a figure nobody trusts.
 */
export function switchCurrency(conversion: Conversion, at: string): void {
  assertConvertible(conversion);
  const s = state();

  s.ingredients = s.ingredients.map((i) => ({
    ...i,
    // An ingredient with no rate has no rate in the new currency either.
    purchasePrice: convertOptional(i.purchasePrice, conversion),
  }));

  // A line the operator priced by hand carries its own figure, and a rate
  // typed on a line does too. Both are money, so both convert.
  s.recipes = s.recipes.map((r) => ({
    ...r,
    components: r.components.map((c) => {
      if (c.kind === 'flat') return { ...c, amount: convert(c.amount, conversion) };
      if (c.entry.mode === 'spend') {
        return { ...c, entry: { mode: 'spend' as const, total: convert(c.entry.total, conversion) } };
      }
      if (c.entry.mode === 'rate') {
        return {
          ...c,
          entry: {
            mode: 'rate' as const,
            ratePerBaseUnit: convert(c.entry.ratePerBaseUnit, conversion),
          },
        };
      }
      return c;
    }),
  }));

  s.meta = Object.fromEntries(
    Object.entries(s.meta).map(([id, m]) => [
      id,
      { ...m, sellingPrice: convertOptional(m.sellingPrice, conversion) },
    ]),
  );

  // Packaging is an amount per portion, so it is money and it converts. A
  // figure left behind here would quietly keep the old currency inside every
  // dish, which is the leak this whole conversion exists to avoid.
  s.packagingPerPortion = convert(s.packagingPerPortion, conversion);

  s.currency = conversion.to;
  s.conversions = [{ ...conversion, at }, ...s.conversions];
}

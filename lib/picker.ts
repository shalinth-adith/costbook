/**
 * What the "add a component" search offers, grouped by what each thing is.
 *
 * Costing treats an ingredient, a preparation and a dish identically once each
 * one's cost per base unit is known — that is the whole of the nesting rule.
 * They are not the same thing to the person cooking, though, and a picker that
 * merges them invites someone to drop a finished dish into another dish
 * without noticing. So the grouping is structural, not decorative.
 */

import type { Ingredient } from '@/core/ingredient';
import { ingredientCost, ratePerUnit } from '@/core/ingredient';
import type { Recipe, RecipeBook } from '@/core/recipe';
import { isComplete, recipeCost } from '@/core/recipe';

import { type ComponentKind, ORG, recipeKind } from './data';
import { rate } from './format';

export type PickerChoice =
  | { readonly kind: 'ingredient'; readonly ingredient: Ingredient }
  | { readonly kind: 'recipe'; readonly recipe: Recipe };

export interface PickerRow {
  readonly key: string;
  readonly kind: ComponentKind;
  readonly name: string;
  readonly meta: string;
  readonly rateText: string;
  readonly uses: string;
  readonly noRate: boolean;
  readonly choice: PickerChoice;
}

export interface PickerGroup {
  readonly kind: ComponentKind;
  readonly rows: readonly PickerRow[];
}

export interface PickerInput {
  readonly shelf: readonly Ingredient[];
  readonly recipes: readonly Recipe[];
  readonly book: RecipeBook;
  readonly excludeRecipeId: string;
  readonly usedInCount: (name: string) => number;
  readonly query: string;
}

function ingredientRow(i: Ingredient, usedInCount: (n: string) => number): PickerRow {
  const c = ingredientCost(i);
  const perUnit = ratePerUnit(c.ratePerBaseUnit, i.purchaseUnit);

  return {
    key: `i:${i.name}`,
    kind: 'ingredient',
    name: i.name,
    meta:
      `bought in · ${i.purchaseUnit} pack` +
      (i.yieldIsAssumed ? ' · no yield on file' : ` · yield ${i.yieldPercent}%`),
    // A rate we do not have reads as absent, never as free.
    rateText:
      perUnit === null ? 'no rate on file' : `${ORG.currencySymbol} ${rate(perUnit)} / ${i.purchaseUnit}`,
    uses: `${usedInCount(i.name)} recipes`,
    noRate: perUnit === null,
    choice: { kind: 'ingredient', ingredient: i },
  };
}

function recipeRow(r: Recipe, book: RecipeBook, usedInCount: (n: string) => number): PickerRow {
  const cost = recipeCost(r, book);
  const per = isComplete(cost) ? cost.costPerBase : null;
  const kind = recipeKind(r);

  return {
    key: `r:${r.id}`,
    kind,
    name: r.name,
    meta:
      kind === 'preparation'
        ? `you make this · one batch yields ${r.outputQty} ${r.outputUnit}`
        : `on your menu · ${String(r.portions)} portions a batch`,
    rateText:
      per === null
        ? 'a rate is missing inside it'
        : `${ORG.currencySymbol} ${rate(per)} / ${r.outputUnit === 'pcs' ? 'pc' : 'base unit'}`,
    uses: `${usedInCount(r.name)} recipes`,
    noRate: per === null,
    choice: { kind: 'recipe', recipe: r },
  };
}

/**
 * Preparations first, because they are what a dish is usually built from.
 * Ingredients next. Dishes last, and only because nesting one is legitimate —
 * it is the uncommon case, so it sits where it will be found deliberately
 * rather than reached for by accident.
 */
export function pickerGroups(input: PickerInput): readonly PickerGroup[] {
  const { shelf, recipes, book, excludeRecipeId, usedInCount, query } = input;

  const ingredients = shelf.map((i) => ingredientRow(i, usedInCount));
  const fromRecipes = recipes
    // A recipe can never be a component of itself. The full loop check runs on
    // add; this only keeps the obvious case out of the list.
    .filter((r) => r.id !== excludeRecipeId)
    .map((r) => recipeRow(r, book, usedInCount));

  const q = query.trim().toLowerCase();
  const match = (r: PickerRow) => q === '' || r.name.toLowerCase().includes(q);

  const groups: PickerGroup[] = [
    { kind: 'preparation', rows: fromRecipes.filter((r) => r.kind === 'preparation').filter(match) },
    { kind: 'ingredient', rows: ingredients.filter(match) },
    { kind: 'dish', rows: fromRecipes.filter((r) => r.kind === 'dish').filter(match) },
  ];

  return groups.filter((g) => g.rows.length > 0);
}

export function countRows(groups: readonly PickerGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length, 0);
}

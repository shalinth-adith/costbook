/**
 * What the "add a component" search offers, grouped by what each thing is.
 *
 * Costing treats an ingredient and a dish identically once each one's cost per
 * base unit is known — that is the whole of the nesting rule. They are not the
 * same thing to the person cooking, though: one arrives from a supplier and
 * the other is made in the kitchen. So the grouping is structural rather than
 * decorative, and a made thing never appears among the ingredients.
 */

import type { Ingredient } from '@/core/ingredient';
import { ingredientCost, ratePerUnit } from '@/core/ingredient';
import type { Recipe, RecipeBook } from '@/core/recipe';
import { isComplete, recipeCost } from '@/core/recipe';

import { type ComponentKind, ORG } from './data';
import { outputText, rate } from './format';

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

  return {
    key: `r:${r.id}`,
    kind: 'dish',
    name: r.name,
    meta:
      `you make this · one batch yields ${outputText(r.outputQty, r.outputUnit)}` +
      (r.portions === null ? '' : ` · ${String(r.portions)} portions`),
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
 * Ingredients first, then dishes: what you buy before what you make, which is
 * the order a cook thinks in and the order these things come into existence.
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
    { kind: 'ingredient', rows: ingredients.filter(match) },
    { kind: 'dish', rows: fromRecipes.filter(match) },
  ];

  return groups.filter((g) => g.rows.length > 0);
}

export function countRows(groups: readonly PickerGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length, 0);
}

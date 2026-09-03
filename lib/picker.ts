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
import type { Pantry, Recipe } from '@/core/recipe';
import { isComplete, recipeCost, wouldCycle } from '@/core/recipe';

import type { ComponentKind } from './data';
import { outputText } from './format';

export type PickerChoice =
  | { readonly kind: 'ingredient'; readonly ingredient: Ingredient }
  | { readonly kind: 'recipe'; readonly recipe: Recipe };

export interface PickerRow {
  readonly key: string;
  readonly kind: ComponentKind;
  readonly name: string;
  readonly meta: string;
  /**
   * The rate per purchase unit, as a figure, for the screen to format in the
   * currency in force. This used to be a preformatted string built with the
   * demo fixture's symbol — `ORG.currencySymbol` from lib/data.ts — so the
   * drawer printed ₹ on a dirham account. The same bug the progress log
   * records fixing on the cost sheet, still live here. A model does not know
   * the currency; the screen does.
   */
  readonly perUnit: number | null;
  readonly unit: string;
  /** Words for when there is no figure: "no rate on file", "missing inside it". */
  readonly rateText: string;
  readonly uses: string;
  readonly noRate: boolean;
  /**
   * Why this cannot be added, if it cannot. Answered before the click rather
   * than raised after it, so the row explains itself in place.
   */
  readonly blocked: string | null;
  readonly choice: PickerChoice;
}

export interface PickerGroup {
  readonly kind: ComponentKind;
  readonly rows: readonly PickerRow[];
}

export interface PickerInput {
  readonly shelf: readonly Ingredient[];
  readonly recipes: readonly Recipe[];
  readonly pantry: Pantry;
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
    perUnit,
    unit: i.purchaseUnit,
    rateText: perUnit === null ? 'no rate on file' : '',
    uses: `${usedInCount(i.name)} recipes`,
    noRate: perUnit === null,
    blocked: null,
    choice: { kind: 'ingredient', ingredient: i },
  };
}

function recipeRow(
  r: Recipe,
  pantry: Pantry,
  usedInCount: (n: string) => number,
  parent: Recipe | undefined,
): PickerRow {
  const cost = recipeCost(r, pantry);
  const per = isComplete(cost) ? cost.costPerBase : null;

  return {
    key: `r:${r.id}`,
    kind: 'dish',
    name: r.name,
    meta:
      `you make this · one batch yields ${outputText(r.outputQty, r.outputUnit)}` +
      (r.portions === null ? '' : ` · ${String(r.portions)} portions`),
    // The figure, for the screen to format; the words only when there is none.
    perUnit: per,
    unit: r.outputUnit === 'pcs' ? 'pc' : 'base unit',
    rateText: per === null ? 'a rate is missing inside it' : '',
    uses: `${usedInCount(r.name)} recipes`,
    noRate: per === null,
    blocked:
      parent === undefined
        ? null
        : (() => {
            const loop = wouldCycle(parent, r.id, pantry.recipes);
            return loop === null
              ? null
              : `already uses ${parent.name}, so adding it would close a loop`;
          })(),
    choice: { kind: 'recipe', recipe: r },
  };
}

/**
 * Ingredients first, then dishes: what you buy before what you make, which is
 * the order a cook thinks in and the order these things come into existence.
 */
export function pickerGroups(input: PickerInput): readonly PickerGroup[] {
  const { shelf, recipes, pantry, excludeRecipeId, usedInCount, query } = input;

  const parent = pantry.recipes.get(excludeRecipeId);

  const ingredients = shelf.map((i) => ingredientRow(i, usedInCount));
  const fromRecipes = recipes
    // A recipe can never be a component of itself.
    .filter((r) => r.id !== excludeRecipeId)
    .map((r) => recipeRow(r, pantry, usedInCount, parent));

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

/**
 * The edits the cost sheet can make, as pure functions on a recipe.
 *
 * They live here rather than inside the component so they can be tested
 * without a browser, and so the same operation means the same thing whichever
 * layout invoked it — the table and the cards share these, which is what makes
 * switching layout mid-edit lose nothing.
 */

import type { Ingredient } from '@/core/ingredient';
import {
  type ComponentScope,
  type CyclePath,
  type Recipe,
  type Pantry,
  RecipeError,
  ingredientComponent,
  recipeBook,
  recipeComponent,
  recipeCost,
  wouldCycle,
} from '@/core/recipe';
import { BASE_UNIT } from '@/core/units';

export type AddChoice =
  | { readonly kind: 'ingredient'; readonly ingredient: Ingredient }
  | { readonly kind: 'recipe'; readonly recipe: Recipe };

export type AddResult =
  | { readonly ok: true; readonly recipe: Recipe }
  | { readonly ok: false; readonly message: string };

export function setQty(recipe: Recipe, index: number, qty: number): Recipe {
  // A quantity of zero is not an edit, it is a removal. Refusing it here keeps
  // the engine from throwing on every keystroke through a cleared field.
  if (!Number.isFinite(qty) || qty <= 0) return recipe;

  return {
    ...recipe,
    components: recipe.components.map((c, i) => (i === index && c.kind !== 'flat' ? { ...c, qty } : c)),
  };
}

export function toggleScope(recipe: Recipe, index: number): Recipe {
  const current = recipe.components[index];
  if (current === undefined) return recipe;
  const next: ComponentScope = current.scope === 'portion' ? 'batch' : 'portion';

  return {
    ...recipe,
    components: recipe.components.map((c, i) => (i === index ? { ...c, scope: next } : c)),
  };
}

export function removeLine(recipe: Recipe, index: number): Recipe {
  return { ...recipe, components: recipe.components.filter((_, i) => i !== index) };
}

/**
 * Add a component, refusing anything the engine cannot cost.
 *
 * The refusal that matters is a loop: adding B to A when B already contains A.
 * It is caught before the line is kept, and reported with the path drawn in
 * the operator's language — never as a database error (FLOWS 5.2).
 */
/** How much of it, as the operator typed it: a figure in a unit. */
export interface Amount {
  readonly qty: number;
  readonly unit: string;
}

export function addComponent(
  recipe: Recipe,
  others: readonly Recipe[],
  ingredients: readonly Ingredient[],
  choice: AddChoice,
  /**
   * Given when the operator typed a quantity at the moment of picking.
   * Absent, the line starts at one purchase unit — 1 kg, 1 l, 1 pc — which
   * is the old behaviour and still what a tablet finger gets.
   */
  amount?: Amount,
): AddResult {
  const pantry = pantryWith(recipe, others, ingredients);

  // Asked before the line is built, so a loop is refused as an answer rather
  // than as an exception thrown from inside a calculation.
  if (choice.kind === 'recipe') {
    const loop = wouldCycle(recipe, choice.recipe.id, pantry.recipes);
    if (loop !== null) return { ok: false, message: cycleMessage(loop) };
  }

  try {
    // A unit in the wrong family — "250 ml" of a thing bought by weight — is
    // refused by ingredientComponent below and lands in the catch as a
    // sentence, never as a line quietly costed at the wrong figure.
    const component =
      choice.kind === 'ingredient'
        ? ingredientComponent(
            choice.ingredient,
            amount?.qty ?? 1,
            amount?.unit ?? choice.ingredient.purchaseUnit,
          )
        : recipeComponent(
            choice.recipe,
            amount?.qty ?? 1,
            amount?.unit ?? BASE_UNIT[choice.recipe.family],
          );

    const next: Recipe = { ...recipe, components: [...recipe.components, component] };

    // Cost it before keeping it, as a second guard on everything else.
    recipeCost(next, pantryWith(next, others, ingredients));

    return { ok: true, recipe: next };
  } catch (error) {
    if (error instanceof RecipeError && error.code === 'cycle') {
      return {
        ok: false,
        message: cycleMessage({ ids: [...error.path], names: [...error.path] }),
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'That line could not be added.',
    };
  }
}

/**
 * The loop, in the operator's words. Never a database error, and never an id
 * — name both recipes and draw the path (FLOWS 5.2).
 */
export function cycleMessage(loop: CyclePath): string {
  const first = loop.names[0] ?? 'This dish';
  const inner = loop.names[1] ?? 'it';

  if (loop.names.length === 2 && first === inner) {
    return `${first} cannot contain itself.`;
  }

  return (
    `${first} cannot contain itself. ${loop.names.join(' → ')} — the loop closes there, ` +
    `so neither ${first} nor ${inner} could be costed until one of the two links goes.`
  );
}

/** Whether adding this choice would close a loop, for marking it before the click. */
export function blockedBy(
  recipe: Recipe,
  others: readonly Recipe[],
  choice: AddChoice,
): CyclePath | null {
  if (choice.kind !== 'recipe') return null;
  return wouldCycle(recipe, choice.recipe.id, recipeBook([...others, recipe]));
}

/** The pantry as it stands with this edit applied. */
export function pantryWith(
  recipe: Recipe,
  others: readonly Recipe[],
  ingredients: readonly Ingredient[],
): Pantry {
  return {
    recipes: recipeBook([...others.filter((r) => r.id !== recipe.id), recipe]),
    ingredients: new Map(ingredients.map((i) => [i.id, i])),
  };
}

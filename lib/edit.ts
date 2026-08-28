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
  type Recipe,
  type RecipeBook,
  RecipeError,
  ingredientComponent,
  recipeBook,
  recipeComponent,
  recipeCost,
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
export function addComponent(
  recipe: Recipe,
  others: readonly Recipe[],
  choice: AddChoice,
): AddResult {
  try {
    const component =
      choice.kind === 'ingredient'
        ? ingredientComponent(choice.ingredient, 1, choice.ingredient.purchaseUnit)
        : recipeComponent(choice.recipe, 1, BASE_UNIT[choice.recipe.family]);

    const next: Recipe = { ...recipe, components: [...recipe.components, component] };

    // Cost it before keeping it, so a loop is refused rather than saved.
    recipeCost(next, bookWith(next, others));

    return { ok: true, recipe: next };
  } catch (error) {
    if (error instanceof RecipeError && error.code === 'cycle') {
      return {
        ok: false,
        message:
          `${recipe.name} cannot contain itself. ${error.path.join(' → ')} — the loop closes ` +
          'there, so neither dish could be costed until one of the two links goes.',
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'That line could not be added.',
    };
  }
}

/** The book as it stands with this edit applied. */
export function bookWith(recipe: Recipe, others: readonly Recipe[]): RecipeBook {
  return recipeBook([...others.filter((r) => r.id !== recipe.id), recipe]);
}

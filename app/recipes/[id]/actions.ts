'use server';

import { revalidatePath } from 'next/cache';

import { withRate } from '@/core/ingredient';
import type { Recipe } from '@/core/recipe';

import type { DishMeta } from '@/lib/data';
import {
  allIngredients,
  getMeta,
  putIngredient,
  putMeta,
  putRecipe,
  recipesUsing,
} from '@/lib/store';

/**
 * The writes the cost sheet makes.
 *
 * Each one returns what it did in the operator's words, because every one of
 * them raises a toast that has to say what happened — and a message assembled
 * on the client from a guess about the server's behaviour is a message that
 * eventually lies.
 */

export interface Ack {
  readonly message: string;
  readonly undoable: boolean;
}

function refresh(id: string): void {
  revalidatePath(`/recipes/${id}`);
  revalidatePath('/dashboard');
  revalidatePath('/recipes');
}

/** Save the components and the dish's own fields, without pricing it. */
export async function saveDraft(recipe: Recipe, dish: Partial<DishMeta>): Promise<Ack> {
  putRecipe(recipe);
  putMeta(recipe.id, { ...dish, onMenu: false, sellingPrice: null });
  refresh(recipe.id);

  return {
    message: 'Saved as a draft. Not on the menu, and nothing has been priced.',
    undoable: true,
  };
}

/** Save and put it on the menu at a price. */
export async function saveAndPrice(
  recipe: Recipe,
  dish: Partial<DishMeta>,
  price: number,
): Promise<Ack> {
  putRecipe(recipe);
  putMeta(recipe.id, { ...dish, onMenu: true, sellingPrice: price });
  refresh(recipe.id);

  return {
    message: `${recipe.name} is on the menu at ₹ ${price.toFixed(2)}.`,
    undoable: false,
  };
}

/** Save changes to a dish already on the menu, leaving its price alone. */
export async function saveChanges(recipe: Recipe, dish: Partial<DishMeta>): Promise<Ack> {
  putRecipe(recipe);
  putMeta(recipe.id, dish);
  refresh(recipe.id);

  return { message: `${recipe.name} saved.`, undoable: true };
}

export async function removeFromMenu(id: string): Promise<Ack> {
  putMeta(id, { onMenu: false, sellingPrice: null });
  refresh(id);
  return { message: 'Taken off the menu. The recipe is kept.', undoable: true };
}

/**
 * Give an ingredient a rate.
 *
 * The acknowledgement counts what else moved, because that is the fact the
 * operator most needs and the one they cannot see from this screen: a rate is
 * shared, and changing it reprices every dish that reaches it.
 */
export async function setIngredientRate(
  ingredientId: string,
  packPrice: number,
  recipeId: string,
): Promise<Ack> {
  const ingredient = allIngredients().find((i) => i.id === ingredientId);
  if (ingredient === undefined) {
    return { message: 'That ingredient is no longer in your list.', undoable: false };
  }

  putIngredient(withRate(ingredient, packPrice));
  const also = recipesUsing(ingredientId).length;
  refresh(recipeId);

  const perUnit = (packPrice / ingredient.purchaseQty) * baseFactor(ingredient.purchaseUnit);
  const others = also <= 1 ? '' : ` ${also} recipes recosted.`;

  return {
    message: `${ingredient.name} is now ₹ ${perUnit.toFixed(2)} / ${ingredient.purchaseUnit}.${others}`,
    undoable: false,
  };
}

/** Rates invert against quantities: 0.445 per gram is 445.00 per kg. */
function baseFactor(unit: string): number {
  const table: Record<string, number> = {
    g: 1, kg: 1000, mg: 0.001, ml: 1, l: 1000, pcs: 1, nos: 1,
  };
  return table[unit] ?? 1;
}

/** Put back exactly what was there, for the Undo on a toast. */
export async function undoTo(recipe: Recipe, dish: DishMeta): Promise<Ack> {
  putRecipe(recipe);
  putMeta(recipe.id, dish);
  refresh(recipe.id);
  return { message: 'Put back.', undoable: false };
}

export async function currentMeta(id: string): Promise<DishMeta | undefined> {
  return getMeta(id);
}

/**
 * A price of its own on the platform (A26).
 *
 * The dine-in price never moves — a channel price is a channel price, not a
 * repricing. That is the whole reason this is a separate field rather than an
 * edit to the menu price.
 */
export async function saveDeliveryPrice(id: string, price: number): Promise<Ack> {
  putMeta(id, { deliveryPrice: price });
  refresh(id);
  return {
    message: `Delivery price set. Your counter price has not moved.`,
    undoable: false,
  };
}

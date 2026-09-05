'use server';

import { revalidatePath } from 'next/cache';

import { withRate } from '@/core/ingredient';
import type { Recipe } from '@/core/recipe';

import type { DishMeta, DishPricing } from '@/lib/data';
import { pantryOf, recipeCost } from '@/core/recipe';
import { formatMoney } from '@/core/currency';
import { buildUp, foodCostPercent, modelForDish, tryRecipeCost } from '@/lib/costing';
import { Stale, book, getMeta, getRecipe, recipesUsing, saveIngredient, saveMeta, saveRecipe, orgModel } from '@/lib/book';

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
  /**
   * The dish's version after the write, for the screen to hold and send back
   * with its next save. Absent when nothing was written.
   */
  readonly version?: string | null;
}

function refresh(id: string): void {
  revalidatePath(`/recipes/${id}`);
  revalidatePath('/dashboard');
  revalidatePath('/recipes');
}

/** Save the components and the dish's own fields, without pricing it. */
export async function saveDraft(recipe: Recipe, dish: Partial<DishMeta>): Promise<Ack> {
  await saveRecipe(recipe, undefined);
  await saveMeta(recipe.id, { ...dish, onMenu: false, sellingPrice: null });
  refresh(recipe.id);

  return {
    message: 'Saved as a draft. Not on the menu, and nothing has been priced.',
    undoable: true,
  };
}

/**
 * Of every 100 of net price, what this dish keeps at `price` today, by its own
 * figures. Stamped beside the price so the sheet can say how far it has
 * drifted since, instead of guessing what the cost used to be.
 */
async function keptNow(recipe: Recipe, price: number): Promise<number | null> {
  const b = await book();
  const others = b.recipes.filter((r) => r.id !== recipe.id);
  const pantry = pantryOf([...others, recipe], b.ingredients);
  const model = modelForDish(await orgModel(), b.meta[recipe.id]?.pricing);
  try {
    const build = buildUp(recipeCost(recipe, pantry), model, {
      labourMinutes: b.meta[recipe.id]?.pricing?.labourMinutes,
    });
    if (!build.complete || build.total === null) return null;
    const fc = foodCostPercent(build.total, price, model);
    return fc === null ? null : Math.round((100 - fc) * 100) / 100;
  } catch {
    return null;
  }
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** The account's money, so a message is not written in somebody else's. */
async function money(amount: number): Promise<string> {
  const { org } = await book();
  return formatMoney(amount, org.currency);
}

/**
 * Whether this dish can be costed at all, as a sentence when it cannot.
 *
 * Not "is anything missing" — a dish short a rate is ordinary and reports a
 * floor. This is the structural kind: a line charged to each portion on a
 * batch that plates into nothing, a link that closes a loop. Stored, they
 * threw on every visit to the dashboard rather than on the screen that made
 * them.
 */
async function refusedBecause(recipe: Recipe): Promise<string | null> {
  const b = await book();
  const withThis = [...b.recipes.filter((r) => r.id !== recipe.id), recipe];
  const attempt = tryRecipeCost(recipe, pantryOf(withThis, b.ingredients));
  return attempt.ok ? null : `${attempt.message} Nothing has been saved.`;
}

/** Save and put it on the menu at a price. */
export async function saveAndPrice(
  recipe: Recipe,
  dish: Partial<DishMeta>,
  price: number,
): Promise<Ack> {
  const refused = await refusedBecause(recipe);
  if (refused !== null) return { message: refused, undoable: false };
  await saveRecipe(recipe, undefined);
  const kept = await keptNow(recipe, price);
  await saveMeta(recipe.id, { ...dish, onMenu: true, sellingPrice: price, pricedAt: today(), keptAtPricing: kept });
  refresh(recipe.id);

  return {
    message: `${recipe.name} is on the menu at ${await money(price)}.`,
    undoable: false,
  };
}

/**
 * A dish's own pricing figures: target, rounding, wastage, packaging, what
 * goes on every plate, overhead, kitchen minutes. Merged field by field, so
 * setting one leaves the rest alone; null puts one back to the account's.
 * These used to live only in the sheet's state and vanish on reload.
 */
export async function saveDishPricing(id: string, patch: Partial<DishPricing>): Promise<Ack> {
  await saveMeta(id, { pricing: patch as DishPricing });
  refresh(id);
  return { message: 'Saved for this dish.', undoable: false };
}

/**
 * "Leave it at 2.29." A deliberate decision to keep a price is a pricing
 * event: drift is measured from today, at what the dish keeps today.
 */
export async function keepPrice(recipe: Recipe, dish: Partial<DishMeta>): Promise<Ack> {
  const price = (await book()).meta[recipe.id]?.sellingPrice ?? null;
  if (price === null) return { message: 'There is no price to keep yet.', undoable: false };
  await saveRecipe(recipe, undefined);
  const kept = await keptNow(recipe, price);
  await saveMeta(recipe.id, { ...dish, pricedAt: today(), keptAtPricing: kept });
  refresh(recipe.id);
  return { message: `Price kept. From today this sheet measures drift from here.`, undoable: false };
}

/** Save changes to a dish already on the menu, leaving its price alone. */
export async function saveChanges(
  recipe: Recipe,
  dish: Partial<DishMeta>,
  /** The version the screen loaded, so a save cannot silently replace somebody else's. */
  expect?: string | null,
): Promise<Ack> {
  const refused = await refusedBecause(recipe);
  // `version: null` so the screen keeps its work marked unsaved. Leaving it
  // out would read as "nothing to save", which is the opposite of the truth.
  if (refused !== null) return { message: refused, undoable: false, version: null };
  let version: string | null;
  try {
    version = await saveRecipe(recipe, undefined, expect ?? null);
  } catch (error) {
    // Said, not thrown: the operator has a screen full of work and needs to
    // be told to reload, not shown an error page that loses it.
    if (error instanceof Stale) return { message: error.message, undoable: false, version: null };
    throw error;
  }
  await saveMeta(recipe.id, dish);
  refresh(recipe.id);

  return { message: `${recipe.name} saved.`, undoable: true, version };
}

export async function removeFromMenu(id: string): Promise<Ack> {
  await saveMeta(id, { onMenu: false, sellingPrice: null });
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
  const ingredient = (await book()).ingredients.find((i) => i.id === ingredientId);
  if (ingredient === undefined) {
    return { message: 'That ingredient is no longer in your list.', undoable: false };
  }

  // Dated, because the date is what every screen ages a rate by. It was left
  // as it stood, so a rate typed here read as fresh on one screen and stale
  // on another.
  await saveIngredient(withRate(ingredient, packPrice, undefined, today()));
  const also = (await recipesUsing(ingredientId)).length;
  refresh(recipeId);

  const perUnit = (packPrice / ingredient.purchaseQty) * baseFactor(ingredient.purchaseUnit);
  const others = also <= 1 ? '' : ` ${also} recipes recosted.`;

  return {
    message: `${ingredient.name} is now ${await money(perUnit)} / ${ingredient.purchaseUnit}.${others}`,
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
  await saveRecipe(recipe, undefined);
  await saveMeta(recipe.id, dish);
  refresh(recipe.id);
  return { message: 'Put back.', undoable: false };
}

export async function currentMeta(id: string): Promise<DishMeta | undefined> {
  return (await getMeta(id));
}

/**
 * A price of its own on the platform (A26).
 *
 * The dine-in price never moves — a channel price is a channel price, not a
 * repricing. That is the whole reason this is a separate field rather than an
 * edit to the menu price.
 */
export async function saveDeliveryPrice(id: string, price: number): Promise<Ack> {
  await saveMeta(id, { deliveryPrice: price });
  refresh(id);
  return {
    message: `Delivery price set. Your counter price has not moved.`,
    undoable: false,
  };
}

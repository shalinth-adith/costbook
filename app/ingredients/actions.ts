'use server';

import { revalidatePath } from 'next/cache';

import { ingredientFromPack, withRate, withYield } from '@/core/ingredient';
import type { UnitFamily } from '@/core/units';

import { allIngredients, putIngredient, recipesUsing } from '@/lib/store';

export interface Ack {
  readonly message: string;
  readonly undoable: boolean;
}

function refresh(): void {
  revalidatePath('/ingredients');
  revalidatePath('/recipes');
  revalidatePath('/dashboard');
}

const today = (): string => new Date().toISOString().slice(0, 10);

function familyOf(unit: string): UnitFamily {
  if (unit === 'l' || unit === 'ml') return 'volume';
  if (unit === 'pc' || unit === 'pcs' || unit === 'nos') return 'count';
  return 'mass';
}

/**
 * Add an ingredient.
 *
 * Four fields and no more. Supplier, category, storage, allergens and yield all
 * exist and are all optional; asking for them at creation would triple the time
 * per ingredient for information a chef between services does not have to hand.
 * They live on the row, found when someone goes looking (A19).
 */
export async function addIngredient(input: {
  name: string;
  packQty: number;
  packUnit: string;
  packPrice: number | null;
}): Promise<Ack & { readonly id: string | null }> {
  const name = input.name.trim();
  if (name === '') {
    return { message: 'An ingredient needs a name.', undoable: false, id: null };
  }
  if (!Number.isFinite(input.packQty) || input.packQty <= 0) {
    return { message: 'A pack has to hold more than nothing.', undoable: false, id: null };
  }

  const made = ingredientFromPack({
    name,
    family: familyOf(input.packUnit),
    packQty: input.packQty,
    packUnit: input.packUnit,
    packPrice: input.packPrice,
  });

  // An ingredient with no rate has never been priced, so it carries no date
  // rather than a date meaning nothing.
  const ingredient =
    input.packPrice === null ? made : { ...made, pricedAt: today() };
  putIngredient(ingredient);
  refresh();

  return {
    message:
      input.packPrice === null
        ? `${name} added with no rate. Any dish using it reports a floor until it has one.`
        : `${name} added.`,
    undoable: false,
    id: ingredient.id,
  };
}

/**
 * Change a rate.
 *
 * One write. Every dish that reaches this ingredient reprices from it on the
 * next read, so the acknowledgement counts what moved - that is the fact the
 * operator most needs and the one this screen cannot show them.
 */
export async function setRate(id: string, packPrice: number): Promise<Ack> {
  const ingredient = allIngredients().find((i) => i.id === id);
  if (ingredient === undefined) {
    return { message: 'That ingredient is no longer in your list.', undoable: false };
  }

  putIngredient(withRate(ingredient, packPrice, undefined, today()));
  const moved = recipesUsing(id).length;
  refresh();

  return {
    message:
      moved === 0
        ? `${ingredient.name} updated. Nothing uses it yet.`
        : `${ingredient.name} updated. ${moved} ${moved === 1 ? 'recipe' : 'recipes'} recosted.`,
    undoable: false,
  };
}

/** A whole market run at once. Nothing is applied until the button is pressed. */
export async function setRates(
  changes: readonly { readonly id: string; readonly packPrice: number }[],
): Promise<Ack> {
  let moved = 0;
  for (const change of changes) {
    const ingredient = allIngredients().find((i) => i.id === change.id);
    if (ingredient === undefined) continue;
    putIngredient(withRate(ingredient, change.packPrice, undefined, today()));
    moved += recipesUsing(change.id).length;
  }
  refresh();

  const n = changes.length;
  return {
    message: `${n} ${n === 1 ? 'rate' : 'rates'} updated, ${moved} recipe ${moved === 1 ? 'line' : 'lines'} recosted.`,
    undoable: false,
  };
}

/**
 * State the yield.
 *
 * Left at 100% this field costs nothing. Below it, the difference between what
 * is bought and what is usable is the whole reason it exists (A19).
 */
export async function setYield(id: string, yieldPercent: number): Promise<Ack> {
  const ingredient = allIngredients().find((i) => i.id === id);
  if (ingredient === undefined) {
    return { message: 'That ingredient is no longer in your list.', undoable: false };
  }
  if (!Number.isFinite(yieldPercent) || yieldPercent <= 0 || yieldPercent > 100) {
    return { message: 'Yield is the usable share of what you buy, so it sits above 0 and at or below 100.', undoable: false };
  }

  putIngredient(withYield(ingredient, yieldPercent));
  refresh();

  return {
    message:
      yieldPercent === 100
        ? `${ingredient.name} set to lose nothing in preparation.`
        : `${ingredient.name} at ${yieldPercent}% yield. The usable rate is now what its recipes pay.`,
    undoable: true,
  };
}

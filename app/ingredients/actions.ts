'use server';

import { revalidatePath } from 'next/cache';

import { ingredientFromPack, withRate, withYield } from '@/core/ingredient';
import type { UnitFamily } from '@/core/units';

import { type Impact, headlineFor, impactOf } from '@/lib/impact';
import { roomForIngredient } from '@/lib/guard';
import { book, orgModel, recipesUsing, saveIngredient, saveMeta } from '@/lib/book';
import { foodCostPercent, modelForDish, suggestPrice } from '@/lib/costing';

/** What the impact panel needs, computed on the server where the costing is. */
export interface RatePreview {
  readonly name: string;
  readonly unit: string;
  readonly from: number | null;
  readonly to: number | null;
  readonly percent: number | null;
  readonly impact: Impact;
  readonly headline: string;
  readonly target: number;
  /**
   * The dishes this rate pushes under their target, each with the price its
   * own rule would now ask for. The one tap that keeps the menu on target.
   */
  readonly raises: readonly Raise[];
}

export interface Raise {
  readonly id: string;
  readonly name: string;
  readonly from: number | null;
  readonly to: number;
  /** What it would keep of every 100 at the new price, by its own figures. */
  readonly keptAfter: number | null;
}

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

  // Server-side, because a cap the screen draws and nobody checks is not a cap.
  const room = await roomForIngredient();
  if (!room.ok) return { message: room.message, undoable: false, id: null };

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
  await saveIngredient(ingredient);
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
  const ingredient = (await book()).ingredients.find((i) => i.id === id);
  if (ingredient === undefined) {
    return { message: 'That ingredient is no longer in your list.', undoable: false };
  }

  await saveIngredient(withRate(ingredient, packPrice, undefined, today()));
  const moved = (await recipesUsing(id)).length;
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
    const ingredient = (await book()).ingredients.find((i) => i.id === change.id);
    if (ingredient === undefined) continue;
    await saveIngredient(withRate(ingredient, change.packPrice, undefined, today()));
    moved += (await recipesUsing(change.id)).length;
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
  const ingredient = (await book()).ingredients.find((i) => i.id === id);
  if (ingredient === undefined) {
    return { message: 'That ingredient is no longer in your list.', undoable: false };
  }
  if (!Number.isFinite(yieldPercent) || yieldPercent <= 0 || yieldPercent > 100) {
    return { message: 'Yield is the usable share of what you buy, so it sits above 0 and at or below 100.', undoable: false };
  }

  await saveIngredient(withYield(ingredient, yieldPercent));
  refresh();

  return {
    message:
      yieldPercent === 100
        ? `${ingredient.name} set to lose nothing in preparation.`
        : `${ingredient.name} at ${yieldPercent}% yield. The usable rate is now what its recipes pay.`,
    undoable: true,
  };
}

/**
 * What a new rate would do, before it is applied (A24).
 *
 * Nothing is repriced by this. The menu stays exactly as it is until the
 * operator applies it, which is the sentence the panel puts under its headline
 * and the reason the panel is worth opening at all.
 */
export async function previewRate(id: string, packPrice: number): Promise<RatePreview | null> {
  const ingredient = (await book()).ingredients.find((i) => i.id === id);
  if (ingredient === undefined) return null;

  const next = withRate(ingredient, packPrice, undefined, today());
  const model = (await orgModel());

  const impact = impactOf({
    recipes: (await book()).recipes,
    ingredients: (await book()).ingredients,
    meta: (await book()).meta,
    model,
    nextIngredients: (await book()).ingredients.map((i) => (i.id === id ? next : i)),
    ingredientId: id,
  });

  const meta = (await book()).meta;
  const raises: Raise[] = impact.crossing.flatMap((mv) => {
    if (mv.newCost === null) return [];
    const own = modelForDish(model, meta[mv.id]?.pricing);
    const s = suggestPrice(mv.newCost, own);
    const fc = foodCostPercent(mv.newCost, s.rounded, own);
    return [{
      id: mv.id,
      name: mv.name,
      from: meta[mv.id]?.sellingPrice ?? null,
      to: s.rounded,
      keptAfter: fc === null ? null : Math.round((100 - fc) * 100) / 100,
    }];
  });

  return {
    raises,
    name: ingredient.name,
    unit: ingredient.purchaseUnit,
    from: ingredient.purchasePrice,
    to: next.purchasePrice,
    // Null rather than 0 when there was no rate on file: a first rate is not a
    // rise of infinity, it is an ingredient that had no rate.
    percent:
      ingredient.purchasePrice === null || ingredient.purchasePrice === 0 || next.purchasePrice === null
        ? null
        : ((next.purchasePrice - ingredient.purchasePrice) / ingredient.purchasePrice) * 100,
    impact,
    headline: headlineFor(impact, model.foodCostTarget),
    target: model.foodCostTarget,
  };
}

/**
 * Apply the rate and raise the dishes it pushed under target, in one tap.
 *
 * The prices come from the preview, worked under each dish's own rule with
 * the new cost, so what the panel showed is exactly what is written.
 */
export async function setRateAndRaise(
  id: string,
  packPrice: number,
  raises: readonly { readonly id: string; readonly to: number; readonly keptAfter: number | null }[],
): Promise<Ack> {
  const ingredient = (await book()).ingredients.find((i) => i.id === id);
  if (ingredient === undefined) {
    return { message: 'That ingredient is no longer in your list.', undoable: false };
  }
  await saveIngredient(withRate(ingredient, packPrice, undefined, today()));
  for (const r of raises) {
    await saveMeta(r.id, { sellingPrice: r.to, pricedAt: today(), keptAtPricing: r.keptAfter });
  }
  refresh();
  const n = raises.length;
  return {
    message: `${ingredient.name} updated and ${String(n)} ${n === 1 ? 'dish' : 'dishes'} raised to stay on target.`,
    undoable: false,
  };
}

/**
 * A chef looked at this rate and it is still right.
 *
 * Recorded even though nothing moved. "Days since anyone confirmed it" is not
 * the same figure as "days since it last changed", and a morning spent
 * checking six prices that had not moved is a morning's work — dropping it
 * means the same six come up again tomorrow.
 */
export async function confirmRate(id: string): Promise<Ack> {
  const ingredient = (await book()).ingredients.find((i) => i.id === id);
  if (ingredient === undefined) {
    return { message: 'That ingredient is no longer in your list.', undoable: false };
  }
  if (ingredient.purchasePrice === null) {
    return { message: `${ingredient.name} has no rate to confirm yet.`, undoable: false };
  }

  await saveIngredient({ ...ingredient, pricedAt: today() }, 'confirmed');
  refresh();

  return { message: `${ingredient.name} confirmed at today's rate.`, undoable: false };
}

'use server';

import { revalidatePath } from 'next/cache';

import type { ImportPlan } from '@/lib/import';
import { currencyIsSettable, saveBook, saveOrg } from '@/lib/book';
import type { DishMeta } from '@/lib/data';

/**
 * Commit an import.
 *
 * One pass, and the plan that performs it is the same object the summary was
 * computed from — so what the operator agreed to is exactly what happens.
 * Partial imports are worse than failed ones (TRD 7).
 */
export async function commitImport(plan: ImportPlan): Promise<{
  readonly message: string;
  readonly undoable: boolean;
}> {
  const today = new Date().toISOString().slice(0, 10);

  const meta: Record<string, DishMeta> = {};
  for (const r of plan.recipes) {
    meta[r.recipe.id] = {
      category: r.category,
      station: null,
      portionSize: null,
      // What the sheet already knew. A price it states is the operator's own
      // figure, not one Costbook invented.
      sellingPrice: r.sellingPrice,
      note: r.method ?? 'Brought in from your sheet. Set the batch size and the price.',
      onMenu: r.sellingPrice !== null,
      updatedAt: today,
    };
  }

  // Ingredients before recipes: a component line references an ingredient by
  // id, and the foreign key will not accept one that is not there yet.
  await saveBook({
    ingredients: plan.ingredients.map((p) => p.ingredient),
    recipes: plan.recipes.map((r) => r.recipe),
    meta,
  });

  revalidatePath('/', 'layout');

  const s = plan.summary;
  const skipped = s.rowsSkipped === 0 ? '' : ` ${s.rowsSkipped} rows were left out.`;

  return {
    message:
      `${s.ingredientsNew} ingredients added, ${s.ratesUpdated} rates updated, ` +
      `${s.dishes} ${s.dishes === 1 ? 'dish' : 'dishes'} created.${skipped}`,
    undoable: false,
  };
}

/**
 * Take the sheet's currency as the account's.
 *
 * Offered only while nothing is costed. Once a rate has been typed, changing
 * the label would leave every figure on file under the wrong symbol — Costbook
 * does not convert, and pretending otherwise here is exactly the quiet
 * wrongness the currency screen exists to prevent.
 */
export async function adoptCurrency(code: string): Promise<{ readonly ok: boolean }> {
  if (!(await currencyIsSettable())) return { ok: false };
  await saveOrg({ currency: code.toUpperCase() });
  revalidatePath('/', 'layout');
  return { ok: true };
}

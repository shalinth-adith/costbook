'use server';

import { revalidatePath } from 'next/cache';

import type { ImportPlan } from '@/lib/import';
import { putIngredient, putMeta, putRecipe } from '@/lib/store';

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
  for (const p of plan.ingredients) putIngredient(p.ingredient);

  const today = new Date().toISOString().slice(0, 10);
  for (const r of plan.recipes) {
    putRecipe(r.recipe);
    putMeta(r.recipe.id, {
      category: r.category,
      station: null,
      portionSize: null,
      sellingPrice: null,
      note: 'Brought in from your sheet. Set the batch size and the price.',
      onMenu: false,
      updatedAt: today,
    });
  }

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

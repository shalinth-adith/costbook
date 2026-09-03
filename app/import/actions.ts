'use server';

import { revalidatePath } from 'next/cache';

import type { ImportPlan } from '@/lib/import';
import { currencyIsSettable, saveBook, saveOrg } from '@/lib/book';
import { importAllowed } from '@/lib/guard';
import type { DishMeta } from '@/lib/data';
import { TARGET_MAX, TARGET_MIN } from '@/lib/org';

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
  /*
   * Server-side, because the screen refusing is a courtesy and this is the
   * write. A free account that reached the last step of the wizard — by an old
   * tab, a back button, or a downgrade part-way through — stops here.
   */
  const allowed = await importAllowed();
  if (!allowed.ok) return { message: allowed.message, undoable: false };

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
      // The note is the operator's, and stays theirs. Costbook writing a
      // sentence into 79 of them is 79 sentences they have to delete.
      note: '',
      method: r.method,
      onMenu: r.sellingPrice !== null,
      custom: r.custom,
      updatedAt: today,
    };
  }

  // Ingredients before recipes: a component line references an ingredient by
  // id, and the foreign key will not accept one that is not there yet.
  try {
    await saveBook({
      ingredients: plan.ingredients.map((p) => p.ingredient),
      recipes: plan.recipes.map((r) => r.recipe),
      meta,
    });
  } catch (error) {
    // Said plainly, and not as a success. An import that reports 74 dishes and
    // writes none is worse than one that fails, because nothing prompts the
    // operator to look.
    return {
      message:
        error instanceof Error
          ? `Nothing was imported. ${error.message}`
          : 'Nothing was imported, and Costbook could not say why.',
      undoable: false,
    };
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

/**
 * Take the sheet's target food cost as the account's.
 *
 * Unlike the currency this is safe at any time and reversible from Settings:
 * the target changes what price Costbook *suggests*, never what anything on
 * file costs. It is offered because a sheet that divides by 0.2 on every row
 * has already answered the question, and Costbook applying its own 32% to it
 * would advise the operator to cut prices they set deliberately.
 */
export async function adoptTarget(percent: number): Promise<{ readonly ok: boolean }> {
  if (!Number.isFinite(percent) || percent < TARGET_MIN || percent > TARGET_MAX) {
    return { ok: false };
  }
  await saveOrg({ foodCostTarget: percent });
  revalidatePath('/', 'layout');
  return { ok: true };
}

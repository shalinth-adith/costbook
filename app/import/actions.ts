'use server';

import { revalidatePath } from 'next/cache';

import type { ImportPlan } from '@/lib/import';
import {
  book,
  currencyIsSettable,
  finishImport,
  orgModel,
  saveBook,
  saveOrg,
  startImport,
  undoImport,
} from '@/lib/book';
import { importAllowed, requireRole } from '@/lib/guard';
import type { DishMeta } from '@/lib/data';
import { type Impact, impactOf } from '@/lib/impact';
import type { RememberedMap } from '@/lib/import-map';
import { TARGET_MAX, TARGET_MIN } from '@/lib/org';

/**
 * Commit an import.
 *
 * One pass, and the plan that performs it is the same object the summary was
 * computed from — so what the operator agreed to is exactly what happens.
 * Partial imports are worse than failed ones (TRD 7).
 */
export interface ImportAck {
  readonly message: string;
  readonly undoable: boolean;
  /**
   * What the commit did to dishes that were already costed.
   *
   * FLOWS 3.3: on a repeat import "the user does not care what was
   * recognised; they care what moved" — this is the bulk version of the
   * rate-change moment in §6, and it is why the screen after commit is the
   * interesting one rather than the mapping.
   *
   * Null on a first import, where nothing existed to move.
   */
  readonly moved: Impact | null;
  /** The import record, so it can be put back. Null when none was opened. */
  readonly importId: string | null;
}

export async function commitImport(
  plan: ImportPlan,
  /**
   * What the operator agreed to, so it can be remembered. The map is by header
   * text rather than column index — see `lib/import-map.ts` for why.
   */
  record?: { readonly filename: string; readonly mapping: RememberedMap },
): Promise<ImportAck> {
  /*
   * Server-side, because the screen refusing is a courtesy and this is the
   * write. A free account that reached the last step of the wizard — by an old
   * tab, a back button, or a downgrade part-way through — stops here.
   */
  const allowed = await importAllowed();
  if (!allowed.ok)
    return { message: allowed.message, undoable: false, moved: null, importId: null };

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

  /*
   * The book as it stands, read before anything is written.
   *
   * Held so the screen after the commit can say what moved rather than what
   * was recognised. It has to be read here: once saveBook returns, the rates
   * it replaced exist only in the history table.
   */
  const was = await book();
  const model = await orgModel();

  /*
   * The record is opened before the write so its id can be stamped on every
   * rate the commit moves. A record that will not open returns null and the
   * import proceeds without one — an import that works and cannot be undone is
   * a great deal better than an import refused because its paperwork failed.
   */
  const importId =
    record === undefined ? null : await startImport(record.filename, record.mapping);

  // Ingredients before recipes: a component line references an ingredient by
  // id, and the foreign key will not accept one that is not there yet.
  try {
    await saveBook({
      ingredients: plan.ingredients.map((p) => p.ingredient),
      recipes: plan.recipes.map((r) => r.recipe),
      meta,
      ...(importId === null ? {} : { importId }),
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
      moved: null,
      importId: null,
    };
  }

  const s = plan.summary;

  if (importId !== null) {
    await finishImport(importId, {
      ingredientsNew: s.ingredientsNew,
      ratesUpdated: s.ratesUpdated,
      dishes: s.dishes,
      rowsSkipped: s.rowsSkipped,
    });
  }

  revalidatePath('/', 'layout');

  /*
   * What the price list did to the menu that was already there.
   *
   * Measured on the dishes as they stand after the import, at the rates on
   * either side of it — so a dish that arrived with this sheet has no cost on
   * the old side and is left out of the movement, rather than counted as
   * inflation from nothing.
   */
  const now = await book();
  const moved =
    was.ingredients.length === 0
      ? null
      : impactOf({
          recipes: now.recipes,
          ingredients: was.ingredients,
          nextIngredients: now.ingredients,
          meta: now.meta,
          model,
        });

  const skipped = s.rowsSkipped === 0 ? '' : ` ${s.rowsSkipped} rows were left out.`;

  return {
    message:
      `${s.ingredientsNew} ingredients added, ${s.ratesUpdated} rates updated, ` +
      `${s.dishes} ${s.dishes === 1 ? 'dish' : 'dishes'} created.${skipped}`,
    undoable: false,
    moved,
    importId,
  };
}

/**
 * Put an import's rates back, inside the seven-day window.
 *
 * Gated on rates rather than on ownership, and again in the database function.
 * Importing is not owner-only — a manager may change rates (FLOWS 9) — so the
 * undo must not be either: whoever can make the change can put it back.
 */
export async function undoLastImport(
  id: string,
): Promise<{ readonly message: string; readonly undoable: boolean }> {
  try {
    await requireRole('rates');
  } catch (error) {
    return {
      message:
        error instanceof Error ? error.message : 'You are not on this book. Sign in again.',
      undoable: false,
    };
  }

  const out = await undoImport(id);
  if (!out.ok) return { message: out.message, undoable: false };

  revalidatePath('/', 'layout');
  return {
    message:
      out.restored === 1
        ? 'One rate is back where it was.'
        : `${String(out.restored)} rates are back where they were. Nothing that arrived was removed.`,
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

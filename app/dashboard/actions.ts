'use server';

import { revalidatePath } from 'next/cache';

import { book, saveSales } from '@/lib/book';
import { requireRole } from '@/lib/guard';
import { periodSaid } from '@/lib/engineering';
import { parseSales } from '@/lib/sales-paste';

export interface Ack {
  readonly message: string;
  readonly undoable: boolean;
}

/**
 * Last month's sales, pasted. Lines that match a dish are saved; the rest are
 * named back. Nothing is guessed: a line that matches no dish is not a dish.
 */
export async function saveMonthSales(period: string, text: string): Promise<Ack & { readonly unmatched: readonly string[] }> {
  await requireRole('costing');
  const b = await book();
  const lines = parseSales(text, b.recipes);
  const rows = lines.flatMap((l) => (l.recipeId !== null && l.sold !== null ? [{ recipeId: l.recipeId, sold: l.sold }] : []));
  const unmatched = lines.filter((l) => l.recipeId === null).map((l) => l.name);
  if (rows.length === 0) {
    return { message: 'No line matched a dish with a number beside it.', undoable: false, unmatched };
  }
  await saveSales(period, rows);
  revalidatePath('/dashboard');
  const n = rows.length;
  return {
    message: `${String(n)} ${n === 1 ? 'dish' : 'dishes'} recorded for ${periodSaid(period)}.${unmatched.length > 0 ? ` ${String(unmatched.length)} ${unmatched.length === 1 ? 'line' : 'lines'} matched no dish.` : ''}`,
    undoable: false,
    unmatched,
  };
}

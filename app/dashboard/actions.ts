'use server';

import { revalidatePath } from 'next/cache';

import { book, saveSales } from '@/lib/book';
import { requireRole, salesAllowed } from '@/lib/guard';
import { monthStart, periodSaid } from '@/lib/engineering';
import { parseSales } from '@/lib/sales-paste';

export interface Ack {
  readonly message: string;
  readonly undoable: boolean;
}

/**
 * Last month's sales, pasted. Lines that match a dish are saved; the rest are
 * named back. Nothing is guessed: a line that matches no dish is not a dish.
 */
export async function saveMonthSales(
  period: string,
  text: string,
): Promise<Ack & { readonly unmatched: readonly string[]; readonly limit?: boolean }> {
  await requireRole('costing');
  // Server-side, because the screen refusing is a courtesy and this is the write.
  const allowed = await salesAllowed();
  if (!allowed.ok) return { message: allowed.message, undoable: false, unmatched: [], limit: true };
  // Written as the first of the month, whichever shape arrived. A period no
  // screen can find again is worse than a refusal.
  const month = monthStart(period);
  if (month === null) {
    return { message: 'That is not a month Costbook can record against.', undoable: false, unmatched: [] };
  }
  const b = await book();
  const lines = parseSales(text, b.recipes);
  const rows = lines.flatMap((l) => (l.recipeId !== null && l.sold !== null ? [{ recipeId: l.recipeId, sold: l.sold }] : []));
  const unmatched = lines.filter((l) => l.recipeId === null).map((l) => l.name);
  if (rows.length === 0) {
    return { message: 'No line matched a dish with a number beside it.', undoable: false, unmatched };
  }
  await saveSales(month, rows);
  revalidatePath('/dashboard');
  const n = rows.length;
  return {
    message: `${String(n)} ${n === 1 ? 'dish' : 'dishes'} recorded for ${periodSaid(month)}.${unmatched.length > 0 ? ` ${String(unmatched.length)} ${unmatched.length === 1 ? 'line' : 'lines'} matched no dish.` : ''}`,
    undoable: false,
    unmatched,
  };
}

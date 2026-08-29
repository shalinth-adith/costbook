'use server';

import { revalidatePath } from 'next/cache';

import { type Conversion, currency } from '@/core/currency';

import { allIngredients, switchCurrency } from '@/lib/store';

/**
 * Move the account into another currency, at the rate the operator gave.
 *
 * The acknowledgement counts what moved, because "every rate converts" is a
 * claim, and the number of rates it touched is the evidence for it.
 */
export async function convertCurrency(conversion: Conversion): Promise<{
  readonly message: string;
  readonly undoable: boolean;
}> {
  const priced = allIngredients().filter((i) => i.purchasePrice !== null).length;

  // `at` is passed in rather than read here, so the store stays a pure record
  // of what it was told.
  switchCurrency(conversion, new Date().toISOString());

  revalidatePath('/', 'layout');

  const to = currency(conversion.to);
  return {
    message:
      `Prices are now in ${to.name}. ${priced} ingredient rate${priced === 1 ? '' : 's'} ` +
      `and every menu price converted at 1 ${conversion.to} = ${conversion.rate} ${conversion.from}.`,
    undoable: false,
  };
}

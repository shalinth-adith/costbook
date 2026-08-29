'use server';

import { revalidatePath } from 'next/cache';

import { currency } from '@/core/currency';

import { currencyIsSettable, setCurrency } from '@/lib/store';

/**
 * Set the currency the account prices in.
 *
 * Refused once anything is costed, because at that point it is not a setting
 * any more — every rate on file was typed in the currency in force when it was
 * entered.
 */
export async function chooseCurrency(code: string): Promise<{
  readonly message: string;
  readonly undoable: boolean;
}> {
  if (!currencyIsSettable()) {
    return {
      message: 'Your currency is already set, because there are dishes costed in it.',
      undoable: false,
    };
  }

  setCurrency(code);
  revalidatePath('/', 'layout');

  return { message: `Prices are now in ${currency(code).name}.`, undoable: false };
}

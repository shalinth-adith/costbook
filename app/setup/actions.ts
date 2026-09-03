'use server';

import { revalidatePath } from 'next/cache';

import type { Charge } from '@/core/charges';

import type { TaxTreatment } from '@/lib/org';
import { currencyIsSettable, saveOrg } from '@/lib/book';

/**
 * Save the four answers and leave setup.
 *
 * Written in one call at the end rather than a step at a time. The wizard holds
 * its own answers until Done, so backing up and changing step 2 does not
 * repeatedly recost a menu that does not exist yet.
 */
export async function finishSetup(answers: {
  readonly name: string;
  readonly currency: string;
  readonly taxTreatment: TaxTreatment;
  readonly charges: readonly Charge[];
  readonly foodCostTarget: number;
  /** Whether the menu price already includes the guest's charges. Suggested by region, decided here. */
  readonly pricesIncludeCharges?: boolean;
}): Promise<{ readonly ok: true }> {
  // Currency only moves while nothing is costed in it. Once a rate has been
  // typed, changing the label would leave every figure under the wrong symbol.
  const settable = await currencyIsSettable();

  await saveOrg({
    ...(settable ? { currency: answers.currency } : {}),
    name: answers.name.trim(),
    taxTreatment: answers.taxTreatment,
    charges: answers.charges,
    foodCostTarget: answers.foodCostTarget,
    ...(answers.pricesIncludeCharges === undefined ? {} : { pricesIncludeCharges: answers.pricesIncludeCharges }),
    setupDone: true,
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

'use server';

import { revalidatePath } from 'next/cache';

import type { Charge } from '@/core/charges';

import type { TaxTreatment } from '@/lib/org';
import { currencyIsSettable, setCurrency, setOrg } from '@/lib/store';

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
}): Promise<{ readonly ok: true }> {
  // Currency has its own precondition, so it does not travel with the patch.
  if (currencyIsSettable()) setCurrency(answers.currency);

  setOrg({
    name: answers.name.trim(),
    taxTreatment: answers.taxTreatment,
    charges: answers.charges,
    foodCostTarget: answers.foodCostTarget,
    setupDone: true,
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

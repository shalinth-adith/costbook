'use server';

import { revalidatePath } from 'next/cache';


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
  readonly country: string | null;
  readonly currency: string;
  readonly teamSize: string | null;
}): Promise<{ readonly ok: true }> {
  // Currency only moves while nothing is costed in it. Once a rate has been
  // typed, changing the label would leave every figure under the wrong symbol.
  const settable = await currencyIsSettable();

  await saveOrg({
    ...(settable ? { currency: answers.currency.toUpperCase() } : {}),
    name: answers.name.trim(),
    country: answers.country,
    teamSize: answers.teamSize,
    setupDone: true,
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

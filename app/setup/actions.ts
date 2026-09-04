'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { PRESETS, type PresetName } from '@/core/rounding';
import { book, currencyIsSettable, saveOrg } from '@/lib/book';
import { landingFor } from '@/lib/landing';
import { TARGET_MAX, TARGET_MIN } from '@/lib/org';

/**
 * Save the four answers and leave setup.
 *
 * Leaving is the action's job, not the wizard's: once `setup_done` is true the
 * setup page turns the account away on its next render, so any screen the
 * wizard tried to show afterwards would be gone before it was read.
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
  /** The supplier share of every hundred, which is what the org stores. */
  readonly foodCostTarget: number;
  readonly rounding: string;
  readonly staleAfterDays: number;
}): Promise<never> {
  // The wizard checks these too; a server action trusts nothing it is sent.
  if (!Number.isFinite(answers.foodCostTarget) || answers.foodCostTarget < TARGET_MIN || answers.foodCostTarget > TARGET_MAX)
    throw new Error(`The keep has to leave between ${TARGET_MIN} and ${TARGET_MAX} of every hundred for suppliers.`);
  if (!(answers.rounding in PRESETS)) throw new Error('That rounding rule is not one Costbook knows.');
  if (!Number.isInteger(answers.staleAfterDays) || answers.staleAfterDays < 1 || answers.staleAfterDays > 365)
    throw new Error('A rate goes stale after a whole number of days, up to 365.');

  // Currency only moves while nothing is costed in it. Once a rate has been
  // typed, changing the label would leave every figure under the wrong symbol.
  const settable = await currencyIsSettable();

  await saveOrg({
    ...(settable ? { currency: answers.currency.toUpperCase() } : {}),
    name: answers.name.trim(),
    country: answers.country,
    teamSize: answers.teamSize,
    foodCostTarget: answers.foodCostTarget,
    rounding: answers.rounding as PresetName,
    staleAfterDays: answers.staleAfterDays,
    setupDone: true,
  });

  const { role } = await book();
  revalidatePath('/', 'layout');
  redirect(landingFor(role ?? 'manager'));
}

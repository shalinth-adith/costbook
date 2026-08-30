'use server';

import { revalidatePath } from 'next/cache';

import type { Charge } from '@/core/charges';
import type { PresetName } from '@/core/rounding';

import { type Impact, impactOf } from '@/lib/impact';
import type { Role, TaxTreatment } from '@/lib/org';
import {
  allIngredients,
  allMeta,
  allRecipes,
  inviteMember,
  orgModel,
  removeMember,
  setMemberRole,
  setOrg,
  setPlan,
} from '@/lib/store';

/**
 * Save a costing change.
 *
 * Applied only after the blast radius has been shown and accepted, which is
 * why this is one call rather than a field-by-field write: the panel the
 * operator agreed to described this whole patch.
 */
export async function saveCosting(patch: {
  readonly foodCostTarget?: number;
  readonly wastagePercent?: number;
  readonly packagingPerPortion?: number;
  readonly rounding?: PresetName;
}): Promise<{ readonly ok: true }> {
  setOrg(patch);
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function saveOrganisation(patch: {
  readonly name?: string;
  readonly taxTreatment?: TaxTreatment;
  readonly staleAfterDays?: number;
  readonly defaultMassUnit?: 'g' | 'kg';
  readonly defaultVolumeUnit?: 'ml' | 'l';
}): Promise<{ readonly ok: true }> {
  setOrg(patch);
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** The whole stack at once — order is a property of the list, not of a row. */
export async function saveCharges(charges: readonly Charge[]): Promise<{ readonly ok: true }> {
  setOrg({ charges: charges.map((c, i) => ({ ...c, order: i + 1 })) });
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function invite(name: string, email: string, role: Role): Promise<{ readonly ok: true }> {
  inviteMember(name, email, role);
  revalidatePath('/settings');
  return { ok: true };
}

export async function drop(email: string): Promise<{ readonly ok: true }> {
  removeMember(email);
  revalidatePath('/settings');
  return { ok: true };
}

export async function changeRole(email: string, role: Role): Promise<{ readonly ok: true }> {
  setMemberRole(email, role);
  revalidatePath('/settings');
  return { ok: true };
}

/** Demo-only, until Razorpay lands at build step 25. */
export async function choosePlan(next: 'free' | 'paid'): Promise<{ readonly ok: true }> {
  setPlan(next);
  revalidatePath('/settings');
  return { ok: true };
}

/**
 * What a costing change would do, without doing it.
 *
 * Computed on the server because it is the same arithmetic that produced every
 * figure already on screen — running a second copy in the browser is how a
 * preview and the thing it previews drift apart. Writes nothing.
 */
export async function previewCosting(next: {
  readonly foodCostTarget: number;
  readonly wastagePercent: number;
  readonly packagingPerPortion: number;
  readonly rounding: PresetName;
}): Promise<Impact> {
  const model = orgModel();
  return impactOf({
    recipes: allRecipes(),
    ingredients: allIngredients(),
    meta: allMeta(),
    model,
    nextModel: { ...model, ...next },
  });
}

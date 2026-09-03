"use server";

import { revalidatePath } from "next/cache";

import type { Charge } from "@/core/charges";
import type { PresetName } from "@/core/rounding";

import { type Impact, impactOf } from "@/lib/impact";
import type { Role, TaxTreatment } from "@/lib/org";
import { book, orgModel, saveOrg } from "@/lib/book";
import { requireRole } from "@/lib/guard";
import { inviteToOrg, removeFromOrg, setOrgRole } from "@/lib/book";

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
  await requireRole("costing");
  await saveOrg(patch);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveOrganisation(patch: {
  readonly name?: string;
  readonly taxTreatment?: TaxTreatment;
  readonly staleAfterDays?: number;
  readonly defaultMassUnit?: "g" | "kg";
  readonly defaultVolumeUnit?: "ml" | "l";
}): Promise<{ readonly ok: true }> {
  await requireRole("costing");
  await saveOrg(patch);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The whole stack at once — order is a property of the list, not of a row. */
export async function saveCharges(
  charges: readonly Charge[],
): Promise<{ readonly ok: true }> {
  await requireRole("charges");
  await saveOrg({ charges: charges.map((c, i) => ({ ...c, order: i + 1 })) });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Record an invitation. It is not sent — nothing sends email yet.
 *
 * The row is what matters and it is what was missing: the signup trigger
 * already joins a new account to the organisation that invited its address,
 * so writing this makes the invitation real even with no mail behind it. The
 * screen says so rather than claiming a send.
 */
export async function invite(
  _name: string,
  email: string,
  role: Role,
): Promise<{ readonly ok: true }> {
  await requireRole("team");
  await inviteToOrg(email, role);
  revalidatePath("/settings");
  return { ok: true };
}

export async function drop(
  id: string,
  pending: boolean,
): Promise<{ readonly ok: true }> {
  await requireRole("team");
  await removeFromOrg(id, pending);
  revalidatePath("/settings");
  return { ok: true };
}

export async function changeRole(
  id: string,
  role: Role,
  pending: boolean,
): Promise<{ readonly ok: true }> {
  await requireRole("team");
  await setOrgRole(id, role, pending);
  revalidatePath("/settings");
  return { ok: true };
}

/*
 * There is no `choosePlan` here any more.
 *
 * It moved an account to the paid tier and took no money, and the two buttons
 * that called it were labelled "Compare with paid" and "See what keeping it
 * current costs" — neither of which promises to change anything. Removing the
 * buttons was not enough on its own: an exported server action is a public
 * endpoint whether or not any component imports it, so leaving it here would
 * have left a free upgrade one POST away for any signed-in owner.
 *
 * `savePlan` in `lib/book.ts` is the seam that stays. It writes the
 * subscriptions row durably, which is what this never did, and it is what the
 * Razorpay callback calls when there is one to call it (TRD build step 25).
 */

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
  const model = await orgModel();
  return impactOf({
    recipes: (await book()).recipes,
    ingredients: (await book()).ingredients,
    meta: (await book()).meta,
    model,
    nextModel: { ...model, ...next },
  });
}

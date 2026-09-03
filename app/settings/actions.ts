"use server";

import { revalidatePath } from "next/cache";

import type { Charge } from "@/core/charges";
import type { PresetName } from "@/core/rounding";
import type { PricingMethod } from "@/lib/costing";
import type { Org } from "@/lib/org";

import { type Impact, impactOf } from "@/lib/impact";
import type { TaxTreatment } from "@/lib/org";
import { book, orgModel, saveOrg } from "@/lib/book";
import { requireRole } from "@/lib/guard";

/**
 * Save a costing change.
 *
 * Applied only after the blast radius has been shown and accepted, which is
 * why this is one call rather than a field-by-field write: the panel the
 * operator agreed to described this whole patch.
 */
export async function saveCosting(patch: CostingPatch): Promise<{ readonly ok: true }> {
  await requireRole("costing");
  await saveOrg(toOrgPatch(patch));
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

/*
 * Invitations, role changes and Remove are gone from here.
 *
 * Costbook is one person per account for now — the owner, who may do
 * everything. The flow those three actions served could not complete at any
 * point: /join never read the token in its link and rendered the lapsed state
 * every time, so somebody invited followed a link that told them the
 * invitation had expired, and no mail was sent to carry the link in the first
 * place.
 *
 * Removed rather than merely unwired from the screen, for the same reason
 * `choosePlan` was: an exported server action is a public endpoint whether or
 * not a component imports it, and these three wrote invitation and membership
 * rows.
 *
 * The database is untouched — `member_role`, the `invitations` table and the
 * owner-gated policies all stay, so a second person is a feature later rather
 * than a migration. PRD 6 and FLOWS 9 both describe the flow; it is deferred,
 * not cancelled.
 */

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
/** The costing figures as the screen names them; `method` is `pricingMethod` on the org. */
export interface CostingPatch {
  readonly foodCostTarget?: number;
  readonly wastagePercent?: number;
  readonly packagingPerPortion?: number;
  readonly rounding?: PresetName;
  readonly method?: PricingMethod;
  readonly moneyPerPlate?: number;
  readonly factor?: number;
  readonly accompanimentsPerPortion?: number;
  readonly labourRatePerHour?: number;
  readonly overheadPerPortion?: number;
  readonly pricesIncludeCharges?: boolean;
  readonly alertMovePercent?: number;
}

function toOrgPatch(p: CostingPatch): Partial<Org> {
  const { method, ...rest } = p;
  return { ...rest, ...(method === undefined ? {} : { pricingMethod: method }) };
}

export async function previewCosting(next: CostingPatch): Promise<Impact> {
  const model = await orgModel();
  return impactOf({
    recipes: (await book()).recipes,
    ingredients: (await book()).ingredients,
    meta: (await book()).meta,
    model,
    nextModel: { ...model, ...next },
  });
}

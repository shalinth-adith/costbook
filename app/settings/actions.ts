"use server";

import { revalidatePath } from "next/cache";

import type { Charge } from "@/core/charges";
import { PRESETS, type PresetName } from "@/core/rounding";
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
  check(patch);
  await saveOrg(toOrgPatch(patch));
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Every figure, against the same bounds the database holds.
 *
 * Without this the screen's own coercion decided what was written: a cleared
 * "days before a rate is stale" became `0`, which the column refuses, and the
 * refusal arrived as a thrown write inside a transition — the error page, for
 * a field somebody blanked. Rounding had no constraint at all, so an unknown
 * rule was stored and read back as one nothing could apply.
 */
function check(patch: CostingPatch): void {
  const range = (
    value: number | undefined,
    what: string,
    low: number,
    high: number,
    { above = false }: { above?: boolean } = {},
  ): void => {
    if (value === undefined) return;
    const ok = Number.isFinite(value) && (above ? value > low : value >= low) && value <= high;
    if (!ok) throw new Error(`${what} has to be between ${low} and ${high}.`);
  };

  range(patch.foodCostTarget, "What the food costs of every hundred", 0, 100, { above: true });
  range(patch.wastagePercent, "Wastage", 0, 100);
  range(patch.packagingPerPortion, "Packaging a plate", 0, 100_000);
  range(patch.accompanimentsPerPortion, "What goes on every plate", 0, 100_000);
  range(patch.labourRatePerHour, "The kitchen rate an hour", 0, 100_000);
  range(patch.overheadPerPortion, "Overhead a plate", 0, 100_000);
  range(patch.moneyPerPlate, "What every plate should leave", 0, 100_000);
  range(patch.factor, "The multiplier", 0, 100, { above: true });
  range(patch.alertMovePercent, "The move worth telling you about", 0, 1000);
  if (patch.rounding !== undefined && !(patch.rounding in PRESETS)) {
    throw new Error("That is not a rounding rule Costbook knows.");
  }
}

export async function saveOrganisation(patch: {
  readonly name?: string;
  readonly taxTreatment?: TaxTreatment;
  readonly staleAfterDays?: number;
  readonly defaultMassUnit?: "g" | "kg";
  readonly defaultVolumeUnit?: "ml" | "l";
}): Promise<{ readonly ok: true }> {
  await requireRole("costing");
  if (patch.name !== undefined && patch.name.trim() === "") {
    throw new Error("Your restaurant needs a name — it heads every prep card.");
  }
  if (
    patch.staleAfterDays !== undefined &&
    (!Number.isInteger(patch.staleAfterDays) || patch.staleAfterDays < 1 || patch.staleAfterDays > 365)
  ) {
    throw new Error("A rate goes stale after a whole number of days, up to 365.");
  }
  await saveOrg({ ...patch, ...(patch.name === undefined ? {} : { name: patch.name.trim() }) });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The whole stack at once — order is a property of the list, not of a row. */
export async function saveCharges(
  charges: readonly Charge[],
): Promise<{ readonly ok: true }> {
  await requireRole("charges");
  for (const c of charges) {
    if (c.name.trim() === "") throw new Error("Every charge needs a name — it goes on the bill.");
    if (!Number.isFinite(c.value) || c.value < 0) {
      throw new Error(`${c.name} cannot be a negative amount.`);
    }
    if (c.mode === "percent" && c.value > 100) {
      throw new Error(`${c.name} is a percentage, so it cannot be over 100.`);
    }
  }
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

/**
 * What one usable base unit of an ingredient costs.
 *
 * The operator enters every figure here. Costbook does not look up a rate,
 * carry a default rate, or infer one from anything. Rates move constantly and
 * are the operator's to know; the product's job is to make entering and
 * recalculating them easier than a spreadsheet, not to have an opinion about
 * what onion costs today.
 *
 * That has one consequence worth stating plainly, because it shapes the types
 * below: a rate we do not have is `null`, never `0`.
 *
 *   null → no rate on file. The cost is unknown. Any recipe using this
 *          ingredient is incomplete and reports a floor, not a cost (FLOWS 4).
 *   0    → genuinely free. Water has a quantity, carries yield meaning, and
 *          costs nothing (TRD 7.1).
 *
 * Collapsing those two into a zero is the failure this module exists to
 * prevent. A guessed figure is worse than a missing one because it is
 * invisible: it passes every validation and silently understates the dish.
 */

import { type UnitFamily, toBase } from './units.js';

/** Yield when the operator has not told us otherwise: assume nothing is lost. */
export const ASSUMED_YIELD_PERCENT = 100;

export interface Ingredient {
  readonly name: string;
  readonly family: UnitFamily;
  /** Size of the purchase pack, in the family's base unit. Must be > 0. */
  readonly purchaseQty: number;
  /** What the operator paid for that pack. `null` means no rate on file. */
  readonly purchasePrice: number | null;
  /** The unit the operator typed. Display only; never drives a calculation. */
  readonly purchaseUnit: string;
  /** Usable proportion after trimming, peeling or boning. 0 < n <= 100. */
  readonly yieldPercent: number;
  /**
   * Whether `yieldPercent` came from the operator or is our assumed 100.
   * An assumed yield understates the cost of anything that gets cleaned, so
   * it must be shown with a DEFAULT chip where the figure appears (FLOWS 2.1),
   * never applied silently.
   */
  readonly yieldIsAssumed: boolean;
}

/** A value the operator did not enter, for disclosure at the point of effect. */
export interface AssumedValue {
  readonly field: 'yieldPercent';
  readonly value: number;
  readonly because: string;
}

export interface IngredientCost {
  /** Cost of one base unit as purchased, before yield loss. */
  readonly ratePerBaseUnit: number | null;
  /** Cost of one *usable* base unit, after yield loss. This is what a recipe pays. */
  readonly effectivePerBaseUnit: number | null;
  /** True when a rate is on file, including a deliberate zero. */
  readonly priced: boolean;
  /** Empty when every figure came from the operator. */
  readonly assumed: readonly AssumedValue[];
}

export type IngredientErrorCode =
  | 'invalid_purchase_qty'
  | 'invalid_purchase_price'
  | 'invalid_yield';

export class IngredientError extends Error {
  readonly code: IngredientErrorCode;
  readonly field: string;

  constructor(code: IngredientErrorCode, message: string, field: string) {
    super(message);
    this.name = 'IngredientError';
    this.code = code;
    this.field = field;
  }
}

function assertValid(ingredient: Ingredient): void {
  const { purchaseQty, purchasePrice, yieldPercent } = ingredient;

  if (!Number.isFinite(purchaseQty) || purchaseQty <= 0) {
    throw new IngredientError(
      'invalid_purchase_qty',
      'A pack has to hold more than nothing — we divide the price by this figure.',
      'purchaseQty',
    );
  }

  if (purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) {
    throw new IngredientError(
      'invalid_purchase_price',
      'A price cannot be negative. Leave it empty if you do not have it yet.',
      'purchasePrice',
    );
  }

  if (!Number.isFinite(yieldPercent) || yieldPercent <= 0 || yieldPercent > 100) {
    throw new IngredientError(
      'invalid_yield',
      'Yield is the usable share of what you buy, so it sits above 0 and at or below 100.',
      'yieldPercent',
    );
  }
}

function assumptionsFor(ingredient: Ingredient): readonly AssumedValue[] {
  if (!ingredient.yieldIsAssumed) return [];
  return [
    {
      field: 'yieldPercent',
      value: ingredient.yieldPercent,
      because: 'No yield on file, so nothing is assumed lost in peeling, trimming or cooking.',
    },
  ];
}

/**
 * Cost of one usable base unit.
 *
 *   ratePerBase = purchasePrice / purchaseQty
 *   effective   = ratePerBase / (yieldPercent / 100)
 *
 * Wastage makes the usable portion more expensive: onion bought at 40 a kg
 * with an 80% yield effectively costs 50 a kg of usable onion. Yield lives on
 * the ingredient rather than on the recipe line because it is a property of
 * the thing bought, not of any one dish (TRD 6.1).
 *
 * Full precision throughout. Rounding happens once, at display (TRD 4).
 */
export function ingredientCost(ingredient: Ingredient): IngredientCost {
  assertValid(ingredient);

  const assumed = assumptionsFor(ingredient);

  if (ingredient.purchasePrice === null) {
    return {
      ratePerBaseUnit: null,
      effectivePerBaseUnit: null,
      priced: false,
      assumed,
    };
  }

  const ratePerBaseUnit = ingredient.purchasePrice / ingredient.purchaseQty;
  const effectivePerBaseUnit = ratePerBaseUnit / (ingredient.yieldPercent / 100);

  return { ratePerBaseUnit, effectivePerBaseUnit, priced: true, assumed };
}

/** Whether this ingredient can contribute a cost to a recipe. */
export function isPriced(ingredient: Ingredient): boolean {
  return ingredient.purchasePrice !== null;
}

export interface PackInput {
  readonly name: string;
  readonly family: UnitFamily;
  /** Pack size in the unit the operator typed — "50" for a 50 kg sack. */
  readonly packQty: number;
  /** The unit the operator typed — "kg". */
  readonly packUnit: string;
  /** What the pack cost. Omit or pass null when there is no rate yet. */
  readonly packPrice: number | null;
  /** Omit entirely when the operator did not give one. */
  readonly yieldPercent?: number;
}

/**
 * Build an ingredient from what the operator actually typed, converting the
 * pack into base units and recording whether the yield was theirs or ours.
 *
 * Nothing here supplies a price. `packPrice: null` stays null all the way
 * through to the dashboard, where it shows as an empty cell rather than a zero.
 */
export function ingredientFromPack(input: PackInput): Ingredient {
  const yieldGiven = input.yieldPercent !== undefined;

  return {
    name: input.name,
    family: input.family,
    purchaseQty: toBase(input.packQty, input.packUnit),
    purchasePrice: input.packPrice,
    purchaseUnit: input.packUnit,
    yieldPercent: yieldGiven ? input.yieldPercent : ASSUMED_YIELD_PERCENT,
    yieldIsAssumed: !yieldGiven,
  };
}

/**
 * Express a per-base-unit rate in the unit the operator reads: 0.05 per gram
 * shown as 50.00 per kg.
 *
 * Note the inversion. A *quantity* converts out of base units by dividing —
 * 1000 g is 1 kg. A *rate* converts by multiplying — 0.05 per g is 50 per kg.
 * Getting this backwards yields a figure a thousand times too small, which is
 * wrong in a way that looks like a formatting bug rather than a costing one,
 * so it lives here rather than in every caller.
 *
 * The arithmetic is `toBase`'s: both multiply by the unit's factor.
 */
export function ratePerUnit(ratePerBaseUnit: number | null, unit: string): number | null {
  if (ratePerBaseUnit === null) return null;
  return toBase(ratePerBaseUnit, unit);
}

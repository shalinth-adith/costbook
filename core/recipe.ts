/**
 * What a batch costs, and what one portion of it costs.
 *
 * Three things beyond a flat ingredient list, each of which exists because a
 * real workbook contained it:
 *
 * 1. Two pools. Most lines are divided across the portions; some apply once
 *    per portion. The reference sheet holds
 *      J = (SUM(G4:G10) - G10) / I4 + G10
 *    where row 10 is ghee, drizzled on every dosa individually rather than
 *    mixed into the batter. Any model that divides everything by portion count
 *    gets that dish wrong by the price of the ghee (TRD 6.2).
 *
 * 2. Flat lines. `1 lot of Blending @ 50`, `1 as req of Salt @ 1.16`. A cost
 *    with a label, not a measurement. Forcing them into a unit family produces
 *    nonsense, so they carry an amount, add to the batch, and stay out of every
 *    yield and output calculation (TRD 3.1, 6.3).
 *
 * 3. Rate or spend, either direction. 251 lines in the reference workbook
 *    derive the rate from the spend, because that is how the information
 *    arrives: someone knows this batch used 0.6 litres and cost 3.76, and has
 *    no idea what the per-litre rate is (TRD 6.6).
 *
 * Nesting arrives at step 6.
 */

import {
  type AssumedValue,
  type Ingredient,
  ingredientCost,
} from './ingredient.js';
import { type UnitFamily, fromBase, toBase, unitFamily } from './units.js';

/**
 * Whether a line's cost is divided across the portions or applied to each one.
 * Defaults to batch everywhere; portion is the operator's explicit choice,
 * labelled in their language as "applied to each portion".
 */
export type ComponentScope = 'batch' | 'portion';

/**
 * Which figure the operator actually typed. Kept rather than derived away,
 * because it decides what happens when the ingredient's rate later moves: a
 * line entered as a rate follows it, a line entered as a spend does not
 * (TRD 6.6).
 */
export type LineEntry =
  | { readonly mode: 'ingredient_rate' }
  | { readonly mode: 'rate'; readonly ratePerBaseUnit: number }
  | { readonly mode: 'spend'; readonly total: number };

export interface IngredientComponent {
  readonly kind: 'ingredient';
  readonly scope: ComponentScope;
  readonly ingredient: Ingredient;
  /** Quantity used, in the ingredient family's base unit. Must be > 0. */
  readonly qty: number;
  /** The unit the operator typed. Display only; never drives the calculation. */
  readonly unit: string;
  readonly entry: LineEntry;
}

/** A cost with a label rather than a measurement. No quantity, no yield. */
export interface FlatComponent {
  readonly kind: 'flat';
  readonly scope: ComponentScope;
  readonly label: string;
  readonly amount: number;
}

export type RecipeComponent = IngredientComponent | FlatComponent;

export interface Recipe {
  readonly name: string;
  /** How many portions one batch yields. Must be > 0. */
  readonly portions: number;
  readonly components: readonly RecipeComponent[];
}

export type EntryMode = LineEntry['mode'] | 'flat';

export interface CostedLine {
  readonly name: string;
  readonly kind: RecipeComponent['kind'];
  readonly scope: ComponentScope;
  /** Zero for a flat line, which has no quantity. */
  readonly qty: number;
  /** Empty for a flat line. */
  readonly unit: string;
  /** What this line contributes. `null` when there is no rate to cost it with. */
  readonly cost: number | null;
  /**
   * Effective cost per base unit for this line, derived when the operator
   * entered a spend. Full precision — the workbook's ROUND(G/D, 2) bakes
   * rounding into a stored rate which then multiplies back out (TRD 6.6).
   */
  readonly ratePerBaseUnit: number | null;
  /** Which figure the operator typed, so the interface shows it back that way. */
  readonly entryMode: EntryMode;
  readonly assumed: readonly AssumedValue[];
}

/** A line we cannot cost, named so the interface can point at it. */
export interface UnpricedLine {
  readonly name: string;
  readonly qty: number;
  readonly unit: string;
}

interface CostedBase {
  readonly name: string;
  readonly portions: number;
  readonly lines: readonly CostedLine[];
  readonly assumed: readonly AssumedValue[];
}

/**
 * Two shapes with different field names rather than one shape with a flag. A
 * caller that reads `.batch` off an incomplete recipe fails to compile instead
 * of quietly printing a floor as though it were a cost (FLOWS 4).
 */
export type RecipeCost =
  | (CostedBase & {
      readonly kind: 'cost';
      /** Cost of the batch pool. */
      readonly batch: number;
      /** Sum of the per-portion lines, applied once to every portion. */
      readonly portionAdd: number;
      readonly perPortion: number;
      /** batch + portionAdd x portions. What the whole batch really costs. */
      readonly total: number;
    })
  | (CostedBase & {
      readonly kind: 'floor';
      readonly batchFloor: number;
      readonly portionAddFloor: number;
      readonly perPortionFloor: number;
      readonly totalFloor: number;
      /** Why this is a floor: the lines with no rate on file. */
      readonly unpriced: readonly UnpricedLine[];
    });

export type RecipeErrorCode =
  | 'invalid_portions'
  | 'invalid_qty'
  | 'invalid_amount'
  | 'family_mismatch';

export class RecipeError extends Error {
  readonly code: RecipeErrorCode;
  readonly field: string;
  /** Which component line, when the fault is on a line rather than the recipe. */
  readonly line: string | null;

  constructor(code: RecipeErrorCode, message: string, field: string, line: string | null = null) {
    super(message);
    this.name = 'RecipeError';
    this.code = code;
    this.field = field;
    this.line = line;
  }
}

export interface ComponentOptions {
  /** Defaults to 'batch'. 'portion' means the cost applies to each portion. */
  readonly scope?: ComponentScope;
  /** A rate the operator typed for this line, overriding the shelf rate. */
  readonly ratePerUnit?: number;
  /**
   * The unit that rate is per. Defaults to the line's own unit, but an
   * operator entering a rate for 200 g of onion types "40 per kg", not
   * "0.04 per g" — so the unit is stated rather than assumed. Assuming it
   * turns a correct figure into one a thousand times too large.
   */
  readonly rateUnit?: string;
  /** What this line actually cost, when that is what the operator knows. */
  readonly spend?: number;
}

/**
 * Build an ingredient line from what the operator typed, converting into base
 * units.
 *
 * Rejects a unit from a different family than the ingredient: 200 ml of
 * something bought by weight needs a density, which the product does not hold,
 * and guessing one misprices the dish silently (TRD 3).
 */
export function ingredientComponent(
  ingredient: Ingredient,
  qty: number,
  unit: string,
  options: ComponentOptions = {},
): IngredientComponent {
  const family: UnitFamily | null = unitFamily(unit);

  if (family === null || family !== ingredient.family) {
    throw new RecipeError(
      'family_mismatch',
      `${ingredient.name} is measured by ${ingredient.family}, so it cannot be used in ${unit}. ` +
        'Converting between them needs a density, which Costbook does not hold.',
      'unit',
      ingredient.name,
    );
  }

  if (options.ratePerUnit !== undefined && options.spend !== undefined) {
    throw new RecipeError(
      'invalid_amount',
      'Give a rate or a total spend, not both — we work the other one out for you.',
      'entry',
      ingredient.name,
    );
  }

  let entry: LineEntry = { mode: 'ingredient_rate' };
  if (options.ratePerUnit !== undefined) {
    const rateUnit = options.rateUnit ?? unit;

    if (unitFamily(rateUnit) !== family) {
      throw new RecipeError(
        'family_mismatch',
        `A rate per ${rateUnit} cannot price a line measured in ${unit}.`,
        'rateUnit',
        ingredient.name,
      );
    }

    // Per-display-unit into per-base-unit divides: 40 per kg is 0.04 per gram.
    // This is the mirror of ingredient.ratePerUnit, which multiplies to go the
    // other way. Using the wrong one is off by the unit's factor and reads as a
    // formatting bug rather than a costing one.
    entry = { mode: 'rate', ratePerBaseUnit: fromBase(options.ratePerUnit, rateUnit) };
  } else if (options.spend !== undefined) {
    entry = { mode: 'spend', total: options.spend };
  }

  return {
    kind: 'ingredient',
    scope: options.scope ?? 'batch',
    ingredient,
    qty: toBase(qty, unit),
    unit,
    entry,
  };
}

/** A cost with a label: a processing charge, an "as required" item, a pinch. */
export function flatComponent(
  label: string,
  amount: number,
  scope: ComponentScope = 'batch',
): FlatComponent {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RecipeError(
      'invalid_amount',
      'A charge cannot be negative.',
      'amount',
      label,
    );
  }
  return { kind: 'flat', scope, label, amount };
}

function assertValid(recipe: Recipe): void {
  if (!Number.isFinite(recipe.portions) || recipe.portions <= 0) {
    throw new RecipeError(
      'invalid_portions',
      'A batch has to make at least one portion — we divide by this figure. ' +
        'Enter 1 if the recipe is written for a single portion.',
      'portions',
    );
  }

  for (const component of recipe.components) {
    if (component.kind !== 'ingredient') continue;
    if (!Number.isFinite(component.qty) || component.qty <= 0) {
      throw new RecipeError(
        'invalid_qty',
        'A component line needs a quantity above zero. Remove the line if it is not used.',
        'qty',
        component.ingredient.name,
      );
    }
  }
}

function costLine(component: RecipeComponent): CostedLine {
  if (component.kind === 'flat') {
    // No quantity, no unit, no yield. A blending charge has no weight (TRD 6.3).
    return {
      name: component.label,
      kind: 'flat',
      scope: component.scope,
      qty: 0,
      unit: '',
      cost: component.amount,
      ratePerBaseUnit: null,
      entryMode: 'flat',
      assumed: [],
    };
  }

  const { entry, qty, ingredient } = component;
  const shelf = ingredientCost(ingredient);
  const yieldFactor = ingredient.yieldPercent / 100;

  let cost: number | null;
  let ratePerBaseUnit: number | null;

  switch (entry.mode) {
    case 'rate':
      // The operator typed an as-purchased rate, so yield still applies: it is
      // a property of the thing bought, not of how it was priced.
      ratePerBaseUnit = entry.ratePerBaseUnit / yieldFactor;
      cost = qty * ratePerBaseUnit;
      break;

    case 'spend':
      // The spend is what the line actually cost. Yield is already inside it,
      // so applying it again would double-count.
      cost = entry.total;
      ratePerBaseUnit = entry.total / qty;
      break;

    case 'ingredient_rate':
      ratePerBaseUnit = shelf.effectivePerBaseUnit;
      cost = ratePerBaseUnit === null ? null : qty * ratePerBaseUnit;
      break;
  }

  return {
    name: ingredient.name,
    kind: 'ingredient',
    scope: component.scope,
    qty,
    unit: component.unit,
    cost,
    ratePerBaseUnit,
    entryMode: entry.mode,
    // A line the operator priced themselves does not lean on the shelf yield.
    assumed: entry.mode === 'ingredient_rate' ? shelf.assumed : [],
  };
}

/**
 * Cost one batch and one portion of it.
 *
 *   batch      = sum of the lines scoped to the batch
 *   portionAdd = sum of the lines scoped to each portion
 *   perPortion = batch / portions + portionAdd
 *   total      = batch + portionAdd x portions
 *
 * Full precision throughout; rounding happens once, at display (TRD 4).
 */
export function recipeCost(recipe: Recipe): RecipeCost {
  assertValid(recipe);

  const lines = recipe.components.map(costLine);
  const assumed = lines.flatMap((line) => line.assumed);

  const unpriced: UnpricedLine[] = lines
    .filter((line) => line.cost === null)
    .map((line) => ({ name: line.name, qty: line.qty, unit: line.unit }));

  const pool = (scope: ComponentScope): number =>
    lines
      .filter((line) => line.scope === scope)
      .reduce((sum, line) => sum + (line.cost ?? 0), 0);

  const batch = pool('batch');
  const portionAdd = pool('portion');
  const perPortion = batch / recipe.portions + portionAdd;
  const total = batch + portionAdd * recipe.portions;

  const base: CostedBase = {
    name: recipe.name,
    portions: recipe.portions,
    lines,
    assumed,
  };

  if (unpriced.length > 0) {
    return {
      ...base,
      kind: 'floor',
      batchFloor: batch,
      portionAddFloor: portionAdd,
      perPortionFloor: perPortion,
      totalFloor: total,
      unpriced,
    };
  }

  return { ...base, kind: 'cost', batch, portionAdd, perPortion, total };
}

/** Whether every line has a rate, so the figures are a cost rather than a floor. */
export function isComplete(cost: RecipeCost): cost is Extract<RecipeCost, { kind: 'cost' }> {
  return cost.kind === 'cost';
}

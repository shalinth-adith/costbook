/**
 * What a batch costs, and what one portion of it costs.
 *
 * This step handles a flat recipe: ingredient lines, all drawn from the batch
 * pool. Per-portion lines and flat-cost lines arrive at step 5, nesting at
 * step 6.
 *
 * The rule that shapes the return type is FLOWS 4: a recipe missing one rate
 * has a cost that can only go up. Calling that figure a cost would be a lie,
 * and the product's entire value is that its numbers are true. So an
 * incomplete recipe reports a *floor* under different field names, and no
 * caller can read one as the other without the compiler objecting.
 *
 * The reference workbook already did the honest version of this with blank
 * guards on every line — an incomplete row yields blank, never zero, so a
 * half-entered recipe never masquerades as a cheap one (TRD Appendix A).
 */

import {
  type AssumedValue,
  type Ingredient,
  ingredientCost,
} from './ingredient.js';
import { type UnitFamily, toBase, unitFamily } from './units.js';

export interface IngredientComponent {
  readonly kind: 'ingredient';
  readonly ingredient: Ingredient;
  /** Quantity used, in the ingredient family's base unit. Must be > 0. */
  readonly qty: number;
  /** The unit the operator typed. Display only; never drives the calculation. */
  readonly unit: string;
}

export type RecipeComponent = IngredientComponent;

export interface Recipe {
  readonly name: string;
  /** How many portions one batch yields. Must be > 0. */
  readonly portions: number;
  readonly components: readonly RecipeComponent[];
}

export interface CostedLine {
  readonly name: string;
  readonly qty: number;
  readonly unit: string;
  /** What this line contributes. `null` when the ingredient has no rate on file. */
  readonly cost: number | null;
  /** Figures the operator did not enter, carried up for disclosure. */
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
 * Deliberately two shapes with different field names rather than one shape
 * with a flag. A dashboard that reads `.batch` off an incomplete recipe fails
 * to compile instead of quietly printing a floor as though it were a cost.
 */
export type RecipeCost =
  | (CostedBase & {
      readonly kind: 'cost';
      /** Every line has a rate, so this is the cost of one batch. */
      readonly batch: number;
      readonly perPortion: number;
    })
  | (CostedBase & {
      readonly kind: 'floor';
      /** Sum of the lines we can cost. The true batch cost is higher than this. */
      readonly batchFloor: number;
      readonly perPortionFloor: number;
      /** Why this is a floor: the lines with no rate on file. */
      readonly unpriced: readonly UnpricedLine[];
    });

export type RecipeErrorCode = 'invalid_portions' | 'invalid_qty' | 'family_mismatch';

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

/**
 * Build a component from what the operator typed, converting into base units.
 *
 * Rejects a unit from a different family than the ingredient: 200 ml of an
 * ingredient bought by weight needs a density, which the product does not
 * hold, and guessing one misprices the dish silently (TRD 3).
 */
export function ingredientComponent(
  ingredient: Ingredient,
  qty: number,
  unit: string,
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

  return { kind: 'ingredient', ingredient, qty: toBase(qty, unit), unit };
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
  const cost = ingredientCost(component.ingredient);

  return {
    name: component.ingredient.name,
    qty: component.qty,
    unit: component.unit,
    cost:
      cost.effectivePerBaseUnit === null ? null : component.qty * cost.effectivePerBaseUnit,
    assumed: cost.assumed,
  };
}

/**
 * Cost one batch and one portion of it.
 *
 *   batch       = sum of every line's cost
 *   perPortion  = batch / portions
 *
 * Full precision throughout; rounding happens once, at display (TRD 4). Two
 * rounding conventions in one workbook is where the reference file's small
 * unexplained variances came from.
 */
export function recipeCost(recipe: Recipe): RecipeCost {
  assertValid(recipe);

  const lines = recipe.components.map(costLine);
  const assumed = lines.flatMap((line) => line.assumed);

  const unpriced: UnpricedLine[] = lines
    .filter((line) => line.cost === null)
    .map((line) => ({ name: line.name, qty: line.qty, unit: line.unit }));

  // Lines we can cost. When any line is unpriced this is a floor, not a total.
  const known = lines.reduce((sum, line) => sum + (line.cost ?? 0), 0);

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
      batchFloor: known,
      perPortionFloor: known / recipe.portions,
      unpriced,
    };
  }

  return {
    ...base,
    kind: 'cost',
    batch: known,
    perPortion: known / recipe.portions,
  };
}

/** Whether every line has a rate, so the figures are a cost rather than a floor. */
export function isComplete(cost: RecipeCost): cost is Extract<RecipeCost, { kind: 'cost' }> {
  return cost.kind === 'cost';
}

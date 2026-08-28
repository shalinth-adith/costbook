/**
 * The view model behind the cost sheet.
 *
 * The engine returns a cost or a floor and nothing else. This turns that into
 * the figures the rail shows, and — importantly — keeps a record of which of
 * them the operator supplied and which Costbook assumed, so every assumed
 * figure can carry a DEFAULT chip beside the number it produced (FLOWS 2.1).
 *
 * Wastage and packaging live here rather than in `core/` on purpose. They are
 * Axis A of the costing model (COSTING_MODELS 2), which becomes real
 * configuration at build step 18; until then they are org defaults applied at
 * one place and labelled everywhere they appear. Nothing about them is hidden.
 */

import { type RecipeCost, isComplete } from '@/core/recipe';

export interface CostingModel {
  /** Applied to the ingredient cost per portion. */
  readonly wastagePercent: number;
  /** A flat amount per portion: boxes, bags, cutlery, labels. */
  readonly packagingPerPortion: number;
  /** What share of the menu price the operator is aiming for the food to be. */
  readonly foodCostTarget: number;
  readonly rounding: RoundingRule;
}

export type RoundingRule = 'charm_99' | 'nearest_5_up' | 'exact';

/**
 * Every default in one place, so the screens can point at it. None of these
 * was entered by the operator, which is why each one renders with a chip.
 */
export const DEFAULT_MODEL: CostingModel = {
  wastagePercent: 2,
  packagingPerPortion: 0.35,
  foodCostTarget: 32,
  rounding: 'charm_99',
};

export const ROUNDING_LABEL: Readonly<Record<RoundingRule, string>> = {
  charm_99: 'round up to the next figure ending in .99',
  nearest_5_up: 'round up to the nearest 5',
  exact: 'leave the exact figure',
};

/** A figure Costbook supplied because the operator has not. */
export interface DefaultedFigure {
  readonly label: string;
  readonly amount: number;
  readonly isDefault: boolean;
}

export interface CostBuildUp {
  /** True when every rate is on file. False makes every figure below a floor. */
  readonly complete: boolean;
  /**
   * What every line costs across the whole batch, per-portion lines included
   * at qty x portions. This is the figure that divides by the portion count,
   * not the batch pool — the batch pool alone would print a division that does
   * not reconcile, and an owner who cannot add up a printed column stops
   * trusting every other figure on the screen.
   */
  readonly linesTotal: number;
  /** The batch pool alone, for a breakdown that wants to separate the two. */
  readonly batchPool: number;
  /** The per-portion pool, applied once to every portion. */
  readonly portionPool: number;
  readonly portions: number | null;
  /** batch / portions + the per-portion lines. */
  readonly ingredientsPerPortion: number;
  readonly wastage: DefaultedFigure;
  readonly packaging: DefaultedFigure;
  /** ingredients + wastage + packaging. */
  readonly total: number;
}

export function buildUp(cost: RecipeCost, model: CostingModel = DEFAULT_MODEL): CostBuildUp {
  const complete = isComplete(cost);
  const batchPool = complete ? cost.batch : cost.batchFloor;
  const portionPool = complete ? cost.portionAdd : cost.portionAddFloor;
  const linesTotal = complete ? cost.total : cost.totalFloor;
  const ingredientsPerPortion = complete ? (cost.perPortion ?? 0) : (cost.perPortionFloor ?? 0);

  const wastage = ingredientsPerPortion * (model.wastagePercent / 100);
  const packaging = model.packagingPerPortion;

  return {
    complete,
    linesTotal,
    batchPool,
    portionPool,
    portions: cost.portions,
    ingredientsPerPortion,
    wastage: { label: `Wastage allowance, ${model.wastagePercent.toFixed(1)}%`, amount: wastage, isDefault: true },
    packaging: { label: 'Direct packaging', amount: packaging, isDefault: true },
    total: ingredientsPerPortion + wastage + packaging,
  };
}

export type TargetStatus = 'on' | 'near' | 'over' | 'incomplete';

/**
 * Within two points either side is "near". The bands exist so a menu reads as
 * a handful of things to look at rather than a wall of red.
 */
export function statusFor(foodCostPercent: number | null, target: number): TargetStatus {
  if (foodCostPercent === null) return 'incomplete';
  if (foodCostPercent > target + 2) return 'over';
  if (foodCostPercent >= target - 2) return 'near';
  return 'on';
}

export const STATUS_LABEL: Readonly<Record<TargetStatus, string>> = {
  on: 'ON TARGET',
  near: 'NEAR TARGET',
  over: 'OVER TARGET',
  incomplete: 'INCOMPLETE',
};

/** Food cost as a share of the menu price. Null when either figure is unknown. */
export function foodCostPercent(total: number, sellingPrice: number | null): number | null {
  if (sellingPrice === null || sellingPrice <= 0) return null;
  return (total / sellingPrice) * 100;
}

export interface PriceSuggestion {
  /** cost / target, before any rounding. Shown so the arithmetic is visible. */
  readonly exact: number;
  /** The figure the rounding rule produces. */
  readonly rounded: number;
  readonly roundedFoodCost: number;
  /** The other candidate, so the operator sees what the choice costs. */
  readonly alternative: number;
  readonly alternativeFoodCost: number;
  readonly ruleLabel: string;
}

function applyRounding(value: number, rule: RoundingRule): number {
  switch (rule) {
    // Always round up. Rounding a suggested price down silently erodes the
    // target the operator just set (COSTING_MODELS Axis F).
    case 'charm_99':
      return Math.ceil(value - 0.99) + 0.99;
    case 'nearest_5_up':
      return Math.ceil(value / 5) * 5;
    case 'exact':
      return Math.round(value * 100) / 100;
  }
}

/**
 * What to charge to hit the target. Never offered for an incomplete dish: a
 * price built on a floor would be a suggestion to lose money.
 */
export function suggestPrice(total: number, model: CostingModel): PriceSuggestion {
  const exact = total / (model.foodCostTarget / 100);
  const rounded = applyRounding(exact, model.rounding);
  const alternative = applyRounding(exact, model.rounding === 'charm_99' ? 'nearest_5_up' : 'charm_99');

  return {
    exact,
    rounded,
    roundedFoodCost: (total / rounded) * 100,
    alternative,
    alternativeFoodCost: (total / alternative) * 100,
    ruleLabel: ROUNDING_LABEL[model.rounding],
  };
}

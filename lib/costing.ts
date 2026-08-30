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

import { type Pantry, type Recipe, type RecipeCost, isComplete, RecipeError, recipeCost } from '@/core/recipe';
import {
  PRESETS,
  type PresetName,
  type RoundingRule,
  applyRounding,
  describeRule,
} from '@/core/rounding';

export interface CostingModel {
  /** Applied to the ingredient cost per portion. */
  readonly wastagePercent: number;
  /** A flat amount per portion: boxes, bags, cutlery, labels. */
  readonly packagingPerPortion: number;
  /** What share of the menu price the operator is aiming for the food to be. */
  readonly foodCostTarget: number;
  /** Named so the interface can offer a list; the rule itself lives in core. */
  readonly rounding: PresetName;
}

/**
 * Every default in one place, so the screens can point at it. None of these
 * was entered by the operator, which is why each one renders with a chip.
 */
export const DEFAULT_MODEL: CostingModel = {
  wastagePercent: 2,
  packagingPerPortion: 0.35,
  foodCostTarget: 32,
  rounding: 'next_9',
};

/**
 * The rules offered on the dish, described in the operator's words. The wording
 * comes from core so the sentence beside a price and the arithmetic behind it
 * can never drift apart.
 */
export const ROUNDING_CHOICES: readonly PresetName[] = [
  'next_9',
  'up_to_5',
  'charm_99',
  'nearest_whole',
  'none',
];

export const ROUNDING_LABEL: Readonly<Record<PresetName, string>> = Object.fromEntries(
  (Object.keys(PRESETS) as PresetName[]).map((name) => [name, describeRule(PRESETS[name])]),
) as Readonly<Record<PresetName, string>>;

export function ruleFor(name: PresetName): RoundingRule {
  return PRESETS[name];
}

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
  /**
   * batch / portions + the per-portion lines. `null` when the dish has no
   * portions — a gravy made by the kilo has no cost per portion, and calling
   * that zero would invent a figure. Everything downstream of it is null too.
   */
  readonly ingredientsPerPortion: number | null;
  readonly wastage: DefaultedFigure | null;
  readonly packaging: DefaultedFigure | null;
  /** ingredients + wastage + packaging. Null when there are no portions. */
  readonly total: number | null;
  /** Always available: what one base unit of the output costs. */
  readonly perBaseUnit: number;
}

export function buildUp(cost: RecipeCost, model: CostingModel = DEFAULT_MODEL): CostBuildUp {
  const complete = isComplete(cost);
  const batchPool = complete ? cost.batch : cost.batchFloor;
  const portionPool = complete ? cost.portionAdd : cost.portionAddFloor;
  const linesTotal = complete ? cost.total : cost.totalFloor;
  const ingredientsPerPortion = complete ? cost.perPortion : cost.perPortionFloor;

  const perBaseUnit = complete ? cost.costPerBase : cost.costPerBaseFloor;

  if (ingredientsPerPortion === null) {
    return {
      complete,
      linesTotal,
      batchPool,
      portionPool,
      portions: null,
      ingredientsPerPortion: null,
      wastage: null,
      packaging: null,
      total: null,
      perBaseUnit,
    };
  }

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
    perBaseUnit,
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

/**
 * What to charge to hit the target. Never offered for an incomplete dish: a
 * price built on a floor would be a suggestion to lose money.
 */
export function suggestPrice(total: number, model: CostingModel): PriceSuggestion {
  const exact = total / (model.foodCostTarget / 100);
  const rounded = applyRounding(exact, ruleFor(model.rounding));

  // The other candidate, so the operator sees what the choice costs rather
  // than being handed one figure and asked to trust it.
  const alternativeName: PresetName = model.rounding === 'next_9' ? 'up_to_5' : 'next_9';
  const alternative = applyRounding(exact, ruleFor(alternativeName));

  return {
    exact,
    rounded,
    roundedFoodCost: (total / rounded) * 100,
    alternative,
    alternativeFoodCost: (total / alternative) * 100,
    ruleLabel: ROUNDING_LABEL[model.rounding],
  };
}

/**
 * Cost a recipe without letting a bad line take the page down.
 *
 * `recipeCost` throws on a recipe it cannot measure, which is right: a figure
 * derived from a line with no quantity would be a wrong number wearing a
 * confident face, and this product's whole argument is that it does not
 * produce those.
 *
 * But a screen that renders a hundred dishes should not go blank because one
 * of them has a bad row, and the operator who sees it needs to be told which
 * dish and which line — not "something broke". So the throw is turned into a
 * value the interface can render.
 */
export type CostAttempt =
  | { readonly ok: true; readonly cost: RecipeCost }
  | { readonly ok: false; readonly message: string; readonly field: string | null };

export function tryRecipeCost(recipe: Recipe, pantry: Pantry): CostAttempt {
  try {
    return { ok: true, cost: recipeCost(recipe, pantry) };
  } catch (error) {
    if (error instanceof RecipeError) {
      return { ok: false, message: error.message, field: error.field ?? null };
    }
    throw error;
  }
}

/**
 * A cost shaped like a floor with nothing in it.
 *
 * What a screen shows while a recipe has a line it cannot measure: no figures,
 * because there are none to show, and no zeros, because a zero would read as a
 * cost of nothing. The message beside it says which line to fix.
 */
export function emptyCost(recipe: Recipe): RecipeCost {
  return {
    kind: 'floor',
    id: recipe.id,
    name: recipe.name,
    portions: recipe.portions,
    outputQty: recipe.outputQty,
    outputUnit: recipe.outputUnit,
    lines: [],
    assumed: [],
    batchFloor: 0,
    portionAddFloor: 0,
    perPortionFloor: null,
    totalFloor: 0,
    costPerBaseFloor: 0,
    unpriced: [],
  };
}

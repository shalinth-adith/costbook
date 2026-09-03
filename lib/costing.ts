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
import { type Charge, applyCharges, netFromGuestTotal } from '@/core/charges';
import type { DishPricing } from '@/lib/data';

/**
 * The last step of the ladder: how a plate cost becomes a price.
 *
 * Forty years of menu-pricing research and every costing tool on the market
 * come down to the same ladder of cost lines with one of three last steps.
 * "Food should be 30% of the price" (Kasavana & Smith's food-cost share),
 * "leave me 8 on every plate" (their contribution margin, said in money), or
 * "three and a bit times the cost" (the factor most chefs price by in their
 * head). Nothing here is a formula the operator types: a mistyped formula
 * prices a whole menu wrong and nothing on screen says so.
 */
export type PricingMethod = 'food_share' | 'money_per_plate' | 'times_cost';

export const PRICING_METHODS: readonly {
  readonly name: PricingMethod;
  readonly label: string;
  readonly said: string;
}[] = [
  { name: 'food_share', label: 'Food share', said: 'Ingredients should be a set share of the price.' },
  { name: 'money_per_plate', label: 'Money per plate', said: 'Every plate should leave a set amount after its cost.' },
  { name: 'times_cost', label: 'Times the cost', said: 'The price is the plate cost times a number.' },
];

export interface CostingModel {
  /** Applied to the ingredient cost per portion. */
  readonly wastagePercent: number;
  /** A flat amount per portion: boxes, bags, cutlery, labels. */
  readonly packagingPerPortion: number;
  /** What share of the menu price the operator is aiming for the food to be. */
  readonly foodCostTarget: number;
  /** Named so the interface can offer a list; the rule itself lives in core. */
  readonly rounding: PresetName;
  /** The last step of the ladder. */
  readonly method: PricingMethod;
  /** What every plate should leave after its cost, for 'money_per_plate'. */
  readonly moneyPerPlate: number;
  /** The multiplier, for 'times_cost'. */
  readonly factor: number;
  /**
   * What goes on every plate without being on the recipe: the sambar, the
   * chutney, the bread and butter. Culinary math calls it the Q factor.
   */
  readonly accompanimentsPerPortion: number;
  /** One kitchen rate. Labour minutes are a fact of each dish, not of the account. */
  readonly labourRatePerHour: number;
  /** Rent, gas, power, per plate: one figure the operator works out from last month. */
  readonly overheadPerPortion: number;
  /**
   * True where the price on the menu already includes what the guest is
   * charged on top — VAT, GST, a service charge. Then a target applies to
   * what the operator actually keeps of the sticker, not to the sticker.
   * No jurisdiction is encoded: the stack says what is charged, this says
   * whether the menu price includes it.
   */
  readonly pricesIncludeCharges: boolean;
  /** The account's charge stack, so a price can be said net and gross. */
  readonly charges: readonly Charge[];
}

/** A dish's own figures that are not settings: labour is a fact about the dish. */
export interface DishCostInputs {
  /** Minutes of kitchen time one batch takes. Null when nobody has said. */
  readonly labourMinutes?: number | null | undefined;
}

/**
 * Every default in one place, so the screens can point at it. None of these
 * was entered by the operator, which is why each one renders with a chip.
 */
export const DEFAULT_MODEL: CostingModel = {
  wastagePercent: 2,
  packagingPerPortion: 0.35,
  // 30, matching what the setup wizard starts at. It carried 32 while setup
  // offered 30, so an account that skipped the question priced two points
  // apart from one that accepted the suggestion — for no stated reason.
  foodCostTarget: 30,
  rounding: 'up_to_tenth',
  method: 'food_share',
  moneyPerPlate: 0,
  factor: 3.3,
  accompanimentsPerPortion: 0,
  labourRatePerHour: 0,
  overheadPerPortion: 0,
  pricesIncludeCharges: false,
  charges: [],
};

/**
 * The rules offered on the dish, described in the operator's words. The wording
 * comes from core so the sentence beside a price and the arithmetic behind it
 * can never drift apart.
 */
export const ROUNDING_CHOICES: readonly PresetName[] = [
  'up_to_tenth',
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
  /** What goes on every plate beside the recipe. Null when the account counts none. */
  readonly accompaniments: DefaultedFigure | null;
  /** Kitchen time, per portion: minutes a batch takes, at the account's rate, over the portions. */
  readonly labour: DefaultedFigure | null;
  /** Rent, gas and power per plate. Null when the account counts none. */
  readonly overhead: DefaultedFigure | null;
  /** Every line above, added up. Null when there are no portions. */
  readonly total: number | null;
  /** Always available: what one base unit of the output costs. */
  readonly perBaseUnit: number;
}

export function buildUp(
  cost: RecipeCost,
  model: CostingModel = DEFAULT_MODEL,
  dish: DishCostInputs = {},
): CostBuildUp {
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
      accompaniments: null,
      labour: null,
      overhead: null,
      total: null,
      perBaseUnit,
    };
  }

  const wastage = ingredientsPerPortion * (model.wastagePercent / 100);
  const packaging = model.packagingPerPortion;

  /*
   * The three lines the research keeps asking for and small kitchens keep
   * leaving out. Each is null when the account counts none of it, so a
   * ladder shows only the lines that are real here — a row of zeros would
   * read as three costs that happen to be nothing.
   */
  const accompaniments =
    model.accompanimentsPerPortion > 0
      ? { label: 'On every plate', amount: model.accompanimentsPerPortion, isDefault: true }
      : null;
  const minutes = dish.labourMinutes ?? null;
  const portions = cost.portions ?? 0;
  const labour =
    minutes !== null && minutes > 0 && model.labourRatePerHour > 0 && portions > 0
      ? {
          label: `Labour, ${String(minutes)} min a batch`,
          amount: ((minutes / 60) * model.labourRatePerHour) / portions,
          isDefault: false,
        }
      : null;
  const overhead =
    model.overheadPerPortion > 0
      ? { label: 'Rent, gas and power', amount: model.overheadPerPortion, isDefault: true }
      : null;

  return {
    complete,
    linesTotal,
    batchPool,
    portionPool,
    portions: cost.portions,
    ingredientsPerPortion,
    wastage: { label: `Wastage allowance, ${model.wastagePercent.toFixed(1)}%`, amount: wastage, isDefault: true },
    packaging: { label: 'Direct packaging', amount: packaging, isDefault: true },
    accompaniments,
    labour,
    overhead,
    total:
      ingredientsPerPortion +
      wastage +
      packaging +
      (accompaniments?.amount ?? 0) +
      (labour?.amount ?? 0) +
      (overhead?.amount ?? 0),
    perBaseUnit,
  };
}

/**
 * What the operator keeps of a menu price before food: the sticker where
 * prices are quoted net, and the sticker with the guest's charges taken back
 * off where the menu price includes them. A 30% target on a VAT-inclusive
 * price is really 31.5% of what the kitchen keeps, and this is the figure the
 * target has to be applied to.
 */
export function netPriceOf(sellingPrice: number, model: CostingModel): number {
  if (!model.pricesIncludeCharges || model.charges.length === 0) return sellingPrice;
  return netFromGuestTotal(sellingPrice, model.charges, 'dine_in');
}

/** The sticker for a net price: the same stack, applied forwards. */
export function stickerOf(net: number, model: CostingModel): number {
  if (!model.pricesIncludeCharges || model.charges.length === 0) return net;
  return applyCharges(net, model.charges, 'dine_in').guestTotal;
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

/**
 * Food cost as a share of what the operator keeps of the menu price. Null
 * when either figure is unknown. Without a model the price is taken as net,
 * which is what every caller before tax-inclusive pricing assumed.
 */
export function foodCostPercent(
  total: number,
  sellingPrice: number | null,
  model?: CostingModel,
): number | null {
  if (sellingPrice === null || sellingPrice <= 0) return null;
  const net = model === undefined ? sellingPrice : netPriceOf(sellingPrice, model);
  if (net <= 0) return null;
  return (total / net) * 100;
}

export interface PriceSuggestion {
  /** What the method asks for, net of any charges the sticker includes. */
  readonly net: number;
  /** The sticker before rounding: `net`, plus the guest's charges where the menu includes them. */
  readonly exact: number;
  /** The figure the rounding rule produces. */
  readonly rounded: number;
  readonly roundedFoodCost: number;
  /** The other candidate, so the operator sees what the choice costs. */
  readonly alternative: number;
  readonly alternativeFoodCost: number;
  readonly ruleLabel: string;
  /** The last step, in the operator's words: "divided by your 30%". */
  readonly methodLabel: string;
}

/** The last step alone, so a preview can say it without pricing anything. */
export function methodLabel(model: CostingModel): string {
  switch (model.method) {
    case 'money_per_plate':
      return `plus ${String(model.moneyPerPlate)} a plate`;
    case 'times_cost':
      return `times ${String(model.factor)}`;
    case 'food_share':
      return `divided by your ${String(model.foodCostTarget)}%`;
  }
}

/**
 * What to charge to hit the target. Never offered for an incomplete dish: a
 * price built on a floor would be a suggestion to lose money.
 */
export function suggestPrice(total: number, model: CostingModel): PriceSuggestion {
  const net =
    model.method === 'money_per_plate'
      ? total + model.moneyPerPlate
      : model.method === 'times_cost'
        ? total * model.factor
        : total / (model.foodCostTarget / 100);
  const exact = stickerOf(net, model);
  const rounded = applyRounding(exact, ruleFor(model.rounding));

  // The other candidate, so the operator sees what the choice costs rather
  // than being handed one figure and asked to trust it.
  const alternativeName: PresetName = model.rounding === 'next_9' ? 'up_to_5' : 'next_9';
  const alternative = applyRounding(exact, ruleFor(alternativeName));

  return {
    net,
    exact,
    rounded,
    roundedFoodCost: (total / netPriceOf(rounded, model)) * 100,
    alternative,
    alternativeFoodCost: (total / netPriceOf(alternative, model)) * 100,
    ruleLabel: ROUNDING_LABEL[model.rounding],
    methodLabel: methodLabel(model),
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

/** The model one dish prices by, from the figures saved on it. */
export function modelForDish(orgModel: CostingModel, pricing: DishPricing | undefined): CostingModel {
  if (pricing === undefined) return dishModel(orgModel);
  return dishModel(orgModel, {
    rounding: pricing.rounding ?? undefined,
    foodCostTarget: pricing.targetFoodCost,
    wastagePercent: pricing.wastagePercent,
    packagingPerPortion: pricing.packagingPerPortion,
    accompanimentsPerPortion: pricing.accompanimentsPerPortion,
    overheadPerPortion: pricing.overheadPerPortion,
    moneyPerPlate: pricing.moneyPerPlate,
  });
}

/**
 * The model one dish prices by: the account's, with that dish's overrides on
 * top of it.
 *
 * This lived inside the cost sheet's `useMemo`, where a line reading
 * `foodCostTarget: ORG.foodCostTarget` sat after the spread of the real
 * account and silently overwrote it with the demo café's 32% — so an operator
 * who set 20% in Settings was still priced at 32% on the only screen where
 * that figure is used, with no test able to see it. Composition order is
 * business logic; it belongs here, where it can be held to account.
 *
 * `null` for an override means "follow the account", not "zero", so a dish
 * that was never given its own target keeps tracking one that changes.
 */
export function dishModel(
  orgModel: CostingModel,
  overrides: {
    readonly rounding?: PresetName | undefined;
    readonly foodCostTarget?: number | null | undefined;
    readonly wastagePercent?: number | null | undefined;
    readonly packagingPerPortion?: number | null | undefined;
    readonly accompanimentsPerPortion?: number | null | undefined;
    readonly overheadPerPortion?: number | null | undefined;
    readonly moneyPerPlate?: number | null | undefined;
  } = {},
): CostingModel {
  return {
    ...DEFAULT_MODEL,
    ...orgModel,
    ...(overrides.rounding === undefined ? {} : { rounding: overrides.rounding }),
    ...(overrides.foodCostTarget === null || overrides.foodCostTarget === undefined
      ? {}
      : { foodCostTarget: overrides.foodCostTarget }),
    ...(overrides.wastagePercent === null || overrides.wastagePercent === undefined
      ? {}
      : { wastagePercent: overrides.wastagePercent }),
    ...(overrides.packagingPerPortion === null || overrides.packagingPerPortion === undefined
      ? {}
      : { packagingPerPortion: overrides.packagingPerPortion }),
    ...(overrides.accompanimentsPerPortion === null || overrides.accompanimentsPerPortion === undefined
      ? {}
      : { accompanimentsPerPortion: overrides.accompanimentsPerPortion }),
    ...(overrides.overheadPerPortion === null || overrides.overheadPerPortion === undefined
      ? {}
      : { overheadPerPortion: overrides.overheadPerPortion }),
    ...(overrides.moneyPerPlate === null || overrides.moneyPerPlate === undefined
      ? {}
      : { moneyPerPlate: overrides.moneyPerPlate }),
  };
}

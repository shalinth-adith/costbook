/**
 * What a batch costs, what one portion of it costs, and what one base unit of
 * it costs when another recipe uses it as a component.
 *
 * The nesting rule is one line: a sub-recipe contributes `qty x child
 * costPerBase`. A recipe behaves exactly like an ingredient once you know what
 * one base unit of it costs (TRD 6.2). Everything else here is bookkeeping
 * around that.
 *
 * This is the part the reference workbook could not do. 81 recipes, 1,074
 * rows, zero links between them, and two lines faking one with a hand-guessed
 * per-portion rate. Costing a parotta plate correctly means costing the
 * parotta, the kuruma and the gravy first, each through its own yield.
 *
 * Components are held by id against a book of recipes rather than by direct
 * reference. A recipe that embedded its children could not describe a cycle,
 * and cycles are exactly what has to be detected (step 7).
 */

import {
  type AssumedValue,
  type Ingredient,
  type IngredientBook,
  ingredientCost,
} from './ingredient';
import { type UnitFamily, fromBase, toBase, unitFamily } from './units';

/**
 * Whether a line's cost is divided across the portions or applied to each one.
 * Defaults to batch; portion is the operator's explicit choice, labelled in
 * their language as "applied to each portion".
 */
export type ComponentScope = 'batch' | 'portion';

/**
 * Which figure the operator actually typed. Kept rather than derived away,
 * because it decides what happens when the underlying rate later moves: a line
 * entered as a rate follows it, a line entered as a spend does not (TRD 6.6).
 */
export type LineEntry =
  | { readonly mode: 'ingredient_rate' }
  | { readonly mode: 'rate'; readonly ratePerBaseUnit: number }
  | { readonly mode: 'spend'; readonly total: number };

export interface IngredientComponent {
  readonly kind: 'ingredient';
  readonly scope: ComponentScope;
  /**
   * Which ingredient, not a copy of it. Held by reference for the same reason
   * a sub-recipe is: an ingredient is one thing the kitchen buys, and a rate
   * change has to reach every line that uses it without anything being kept
   * in step by hand.
   */
  readonly ingredientId: string;
  /** Quantity used, in the ingredient family's base unit. Must be > 0. */
  readonly qty: number;
  /** The unit the operator typed. Display only; never drives the calculation. */
  readonly unit: string;
  readonly entry: LineEntry;
}

/** Another of the operator's own recipes, used as an ingredient. */
export interface RecipeComponentRef {
  readonly kind: 'recipe';
  readonly scope: ComponentScope;
  readonly childId: string;
  /** Quantity used, in the child's output family base unit. Must be > 0. */
  readonly qty: number;
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

export type RecipeComponent = IngredientComponent | RecipeComponentRef | FlatComponent;

export interface Recipe {
  readonly id: string;
  readonly name: string;
  /** The family this recipe's output is measured in. */
  readonly family: UnitFamily;
  /** What one batch yields, in base units. Entered by the operator, never inferred. */
  readonly outputQty: number;
  /** The unit the operator typed for the output. Display only. */
  readonly outputUnit: string;
  /** How many portions one batch plates. `null` for a sub-recipe never served. */
  readonly portions: number | null;
  readonly components: readonly RecipeComponent[];
}

/** Every recipe the costing can reach, by id. */
export type RecipeBook = ReadonlyMap<string, Recipe>;

/**
 * Everything a costing needs to resolve: the recipes it may nest, and the
 * ingredients its lines point at. Plain data in, plain data out — this is
 * what a route handler assembles from the database and hands over (TRD 2).
 */
export interface Pantry {
  readonly recipes: RecipeBook;
  readonly ingredients: IngredientBook;
}

export const EMPTY_PANTRY: Pantry = { recipes: new Map(), ingredients: new Map() };

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
  /** Effective cost per base unit for this line. Derived when a spend was typed. */
  readonly ratePerBaseUnit: number | null;
  /**
   * The yield actually used, reported by whoever resolved the ingredient
   * rather than looked up again by the screen. Null for a sub-recipe, whose
   * own yields are already inside its figure, and for a flat line, which has
   * no weight to lose.
   */
  readonly yieldPercent: number | null;
  /** Which ingredient or recipe this line points at, for linking to it. */
  readonly refId: string | null;
  /** Which figure the operator typed, so the interface shows it back that way. */
  readonly entryMode: EntryMode;
  readonly assumed: readonly AssumedValue[];
}

/** A line we cannot cost, named so the interface can point at it. */
export interface UnpricedLine {
  readonly name: string;
  readonly qty: number;
  readonly unit: string;
  /**
   * The chain of recipes it was reached through, outermost first. Empty when
   * the line sits directly on the recipe being costed. A plate can be
   * incomplete because of a rate three levels down, and the operator needs to
   * be told where to go.
   */
  readonly via: readonly string[];
}

interface CostedBase {
  readonly id: string;
  readonly name: string;
  readonly portions: number | null;
  readonly outputQty: number;
  readonly outputUnit: string;
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
      /** `null` for a sub-recipe with no portions. */
      readonly perPortion: number | null;
      /** batch + portionAdd x portions. What the whole batch really costs. */
      readonly total: number;
      /** What one base unit of the output costs. This is what a parent pays. */
      readonly costPerBase: number;
    })
  | (CostedBase & {
      readonly kind: 'floor';
      readonly batchFloor: number;
      readonly portionAddFloor: number;
      readonly perPortionFloor: number | null;
      readonly totalFloor: number;
      readonly costPerBaseFloor: number;
      /** Why this is a floor: every line with no rate, wherever it sits. */
      readonly unpriced: readonly UnpricedLine[];
    });

export type RecipeErrorCode =
  | 'invalid_portions'
  | 'invalid_output'
  | 'invalid_qty'
  | 'invalid_amount'
  | 'family_mismatch'
  | 'unknown_recipe'
  | 'unknown_ingredient'
  | 'portion_scope_without_portions'
  | 'cycle';

export class RecipeError extends Error {
  readonly code: RecipeErrorCode;
  readonly field: string;
  /** Which component line, when the fault is on a line rather than the recipe. */
  readonly line: string | null;
  /** The chain of recipe names involved, for a cycle or a nested fault. */
  readonly path: readonly string[];

  constructor(
    code: RecipeErrorCode,
    message: string,
    field: string,
    line: string | null = null,
    path: readonly string[] = [],
  ) {
    super(message);
    this.name = 'RecipeError';
    this.code = code;
    this.field = field;
    this.line = line;
    this.path = path;
  }
}

export interface ComponentOptions {
  /** Defaults to 'batch'. 'portion' means the cost applies to each portion. */
  readonly scope?: ComponentScope;
  /** A rate the operator typed for this line, overriding the derived one. */
  readonly ratePerUnit?: number;
  /**
   * The unit that rate is per. Defaults to the line's own unit, but an
   * operator entering a rate for 200 g of onion types "40 per kg", not
   * "0.04 per g" — so the unit is stated rather than assumed.
   */
  readonly rateUnit?: string;
  /** What this line actually cost, when that is what the operator knows. */
  readonly spend?: number;
}

function buildEntry(
  options: ComponentOptions,
  unit: string,
  family: UnitFamily,
  lineName: string,
): LineEntry {
  if (options.ratePerUnit !== undefined && options.spend !== undefined) {
    throw new RecipeError(
      'invalid_amount',
      'Give a rate or a total spend, not both — we work the other one out for you.',
      'entry',
      lineName,
    );
  }

  if (options.ratePerUnit !== undefined) {
    const rateUnit = options.rateUnit ?? unit;
    if (unitFamily(rateUnit) !== family) {
      throw new RecipeError(
        'family_mismatch',
        `A rate per ${rateUnit} cannot price a line measured in ${unit}.`,
        'rateUnit',
        lineName,
      );
    }
    // Per-display-unit into per-base-unit divides: 40 per kg is 0.04 per gram.
    // The mirror of ingredient.ratePerUnit, which multiplies to go the other way.
    return { mode: 'rate', ratePerBaseUnit: fromBase(options.ratePerUnit, rateUnit) };
  }

  if (options.spend !== undefined) return { mode: 'spend', total: options.spend };

  return { mode: 'ingredient_rate' };
}

/**
 * Build an ingredient line from what the operator typed, converting into base
 * units. Rejects a unit from another family: 200 ml of something bought by
 * weight needs a density, which the product does not hold (TRD 3).
 */
export function ingredientComponent(
  ingredient: Ingredient,
  qty: number,
  unit: string,
  options: ComponentOptions = {},
): IngredientComponent {
  const family = unitFamily(unit);

  if (family === null || family !== ingredient.family) {
    throw new RecipeError(
      'family_mismatch',
      `${ingredient.name} is measured by ${ingredient.family}, so it cannot be used in ${unit}. ` +
        'Converting between them needs a density, which Costbook does not hold.',
      'unit',
      ingredient.name,
    );
  }

  return {
    kind: 'ingredient',
    scope: options.scope ?? 'batch',
    ingredientId: ingredient.id,
    qty: toBase(qty, unit),
    unit,
    entry: buildEntry(options, unit, family, ingredient.name),
  };
}

/** Use one of the operator's own recipes as a component of another. */
export function recipeComponent(
  child: Recipe,
  qty: number,
  unit: string,
  options: ComponentOptions = {},
): RecipeComponentRef {
  const family = unitFamily(unit);

  if (family === null || family !== child.family) {
    throw new RecipeError(
      'family_mismatch',
      `${child.name} is made in ${child.family}, so it cannot be used in ${unit}.`,
      'unit',
      child.name,
    );
  }

  return {
    kind: 'recipe',
    scope: options.scope ?? 'batch',
    childId: child.id,
    qty: toBase(qty, unit),
    unit,
    entry: buildEntry(options, unit, family, child.name),
  };
}

/** A cost with a label: a processing charge, an "as required" item, a pinch. */
export function flatComponent(
  label: string,
  amount: number,
  scope: ComponentScope = 'batch',
): FlatComponent {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RecipeError('invalid_amount', 'A charge cannot be negative.', 'amount', label);
  }
  return { kind: 'flat', scope, label, amount };
}

/** Build a book from a list, for callers that hold recipes as an array. */
export function recipeBook(recipes: readonly Recipe[]): RecipeBook {
  return new Map(recipes.map((r) => [r.id, r]));
}

function assertValid(recipe: Recipe): void {
  if (!Number.isFinite(recipe.outputQty) || recipe.outputQty <= 0) {
    throw new RecipeError(
      'invalid_output',
      'A batch has to yield something — we divide by this figure when another ' +
        'recipe uses it. Enter what one batch makes.',
      'outputQty',
    );
  }

  if (recipe.portions !== null && (!Number.isFinite(recipe.portions) || recipe.portions <= 0)) {
    throw new RecipeError(
      'invalid_portions',
      'A batch has to make at least one portion — we divide by this figure. ' +
        'Enter 1 if the recipe is written for a single portion.',
      'portions',
    );
  }

  for (const component of recipe.components) {
    if (component.kind === 'flat') continue;

    const label = component.kind === 'ingredient' ? component.ingredientId : component.childId;

    if (!Number.isFinite(component.qty) || component.qty <= 0) {
      throw new RecipeError(
        'invalid_qty',
        'A component line needs a quantity above zero. Remove the line if it is not used.',
        'qty',
        label,
      );
    }

    if (component.scope === 'portion' && recipe.portions === null) {
      throw new RecipeError(
        'portion_scope_without_portions',
        `${recipe.name} does not plate into portions, so a line cannot apply to each one. ` +
          'Give it a portion count, or move the line into the batch.',
        'scope',
        label,
      );
    }
  }
}

/** Applies the operator's entry over a derived rate, uniformly for any line kind. */
function applyEntry(
  entry: LineEntry,
  qty: number,
  derivedPerBase: number | null,
  yieldFactor: number,
): { cost: number | null; ratePerBaseUnit: number | null } {
  switch (entry.mode) {
    case 'rate': {
      // A typed rate is as-purchased, so yield still applies: it is a property
      // of the thing bought, not of how it was priced.
      const rate = entry.ratePerBaseUnit / yieldFactor;
      return { cost: qty * rate, ratePerBaseUnit: rate };
    }
    case 'spend':
      // The spend is what the line actually cost. Yield is already inside it,
      // so applying it again would double-count.
      return { cost: entry.total, ratePerBaseUnit: entry.total / qty };
    case 'ingredient_rate':
      return {
        cost: derivedPerBase === null ? null : qty * derivedPerBase,
        ratePerBaseUnit: derivedPerBase,
      };
  }
}

interface LineResult {
  readonly line: CostedLine;
  /** Unpriced leaves discovered inside a sub-recipe, with their path. */
  readonly nested: readonly UnpricedLine[];
}

function costRecipeInner(
  recipe: Recipe,
  pantry: Pantry,
  visiting: readonly string[],
  memo: Map<string, RecipeCost>,
): RecipeCost {
  assertValid(recipe);

  if (visiting.includes(recipe.id)) {
    const loop = [...visiting.slice(visiting.indexOf(recipe.id)), recipe.id];
    throw new RecipeError(
      'cycle',
      `${recipe.name} would need itself to be costed first, so neither figure can ever settle.`,
      'components',
      recipe.name,
      // Names, not ids. A loop shown to a cook has to read in their words.
      loop.map((id) => pantry.recipes.get(id)?.name ?? id),
    );
  }

  const cached = memo.get(recipe.id);
  if (cached !== undefined) return cached;

  const nextVisiting = [...visiting, recipe.id];

  const results: LineResult[] = recipe.components.map((component): LineResult => {
    if (component.kind === 'flat') {
      // No quantity, no unit, no yield. A blending charge has no weight (TRD 6.3).
      return {
        line: {
          name: component.label,
          kind: 'flat',
          scope: component.scope,
          qty: 0,
          unit: '',
          cost: component.amount,
          ratePerBaseUnit: null,
          yieldPercent: null,
          refId: null,
          entryMode: 'flat',
          assumed: [],
        },
        nested: [],
      };
    }

    if (component.kind === 'ingredient') {
      const ingredient = pantry.ingredients.get(component.ingredientId);
      if (ingredient === undefined) {
        throw new RecipeError(
          'unknown_ingredient',
          'This line points at an ingredient that is not in the list.',
          'ingredientId',
          component.ingredientId,
          nextVisiting,
        );
      }

      const shelf = ingredientCost(ingredient);
      const applied = applyEntry(
        component.entry,
        component.qty,
        shelf.effectivePerBaseUnit,
        ingredient.yieldPercent / 100,
      );

      return {
        line: {
          name: ingredient.name,
          kind: 'ingredient',
          scope: component.scope,
          qty: component.qty,
          unit: component.unit,
          cost: applied.cost,
          ratePerBaseUnit: applied.ratePerBaseUnit,
          yieldPercent: ingredient.yieldPercent,
          refId: ingredient.id,
          entryMode: component.entry.mode,
          // A line the operator priced themselves does not lean on the shelf yield.
          assumed: component.entry.mode === 'ingredient_rate' ? shelf.assumed : [],
        },
        nested: [],
      };
    }

    const child = pantry.recipes.get(component.childId);
    if (child === undefined) {
      throw new RecipeError(
        'unknown_recipe',
        'This line points at a recipe that is not in the book.',
        'childId',
        component.childId,
        nextVisiting,
      );
    }

    const childCost = costRecipeInner(child, pantry, nextVisiting, memo);

    // The whole of the nesting rule: qty x what one base unit of the child
    // costs. Yield does not apply again — the child's own yields are already
    // inside its figure.
    const derived =
      childCost.kind === 'cost' ? childCost.costPerBase : null;

    const applied = applyEntry(component.entry, component.qty, derived, 1);

    const nested: UnpricedLine[] =
      childCost.kind === 'floor' && component.entry.mode === 'ingredient_rate'
        ? childCost.unpriced.map((u) => ({ ...u, via: [child.name, ...u.via] }))
        : [];

    return {
      line: {
        name: child.name,
        kind: 'recipe',
        scope: component.scope,
        qty: component.qty,
        unit: component.unit,
        cost: applied.cost,
        ratePerBaseUnit: applied.ratePerBaseUnit,
        yieldPercent: null,
        refId: child.id,
        entryMode: component.entry.mode,
        assumed: component.entry.mode === 'ingredient_rate' ? childCost.assumed : [],
      },
      nested,
    };
  });

  const lines = results.map((r) => r.line);
  const assumed = lines.flatMap((l) => l.assumed);

  const unpriced: UnpricedLine[] = [
    ...lines
      .filter((l) => l.cost === null && l.kind !== 'recipe')
      .map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, via: [] as readonly string[] })),
    ...results.flatMap((r) => r.nested),
  ];

  const pool = (scope: ComponentScope): number =>
    lines.filter((l) => l.scope === scope).reduce((sum, l) => sum + (l.cost ?? 0), 0);

  const batch = pool('batch');
  const portionAdd = pool('portion');
  const portions = recipe.portions;
  const perPortion = portions === null ? null : batch / portions + portionAdd;
  const total = portions === null ? batch : batch + portionAdd * portions;
  const costPerBase = total / recipe.outputQty;

  const base: CostedBase = {
    id: recipe.id,
    name: recipe.name,
    portions,
    outputQty: recipe.outputQty,
    outputUnit: recipe.outputUnit,
    lines,
    assumed,
  };

  const result: RecipeCost =
    unpriced.length > 0
      ? {
          ...base,
          kind: 'floor',
          batchFloor: batch,
          portionAddFloor: portionAdd,
          perPortionFloor: perPortion,
          totalFloor: total,
          costPerBaseFloor: costPerBase,
          unpriced,
        }
      : { ...base, kind: 'cost', batch, portionAdd, perPortion, total, costPerBase };

  memo.set(recipe.id, result);
  return result;
}

/**
 * Cost one batch, one portion of it, and one base unit of its output.
 *
 *   batch       = sum of the lines scoped to the batch
 *   portionAdd  = sum of the lines scoped to each portion
 *   perPortion  = batch / portions + portionAdd
 *   total       = batch + portionAdd x portions
 *   costPerBase = total / outputQty
 *
 * Full precision throughout; rounding happens once, at display (TRD 4).
 * Children are costed once each per call and reused, so a plate that reaches
 * the same gravy by two routes does not cost it twice.
 */
export function recipeCost(recipe: Recipe, pantry: Pantry = EMPTY_PANTRY): RecipeCost {
  return costRecipeInner(recipe, pantry, [], new Map());
}

/** Assemble a pantry from plain lists. */
export function pantryOf(
  recipes: readonly Recipe[],
  ingredients: readonly Ingredient[],
): Pantry {
  return {
    recipes: recipeBook(recipes),
    ingredients: new Map(ingredients.map((i) => [i.id, i])),
  };
}

/** Whether every line has a rate, so the figures are a cost rather than a floor. */
export function isComplete(cost: RecipeCost): cost is Extract<RecipeCost, { kind: 'cost' }> {
  return cost.kind === 'cost';
}


/** A loop, as the chain of recipe names that closes it. */
export interface CyclePath {
  /** Recipe ids, outermost first, ending where the loop closes. */
  readonly ids: readonly string[];
  /** The same chain in the operator's words, for showing. */
  readonly names: readonly string[];
}

function walk(
  id: string,
  book: RecipeBook,
  trail: readonly string[],
): CyclePath | null {
  if (trail.includes(id)) {
    const ids = [...trail.slice(trail.indexOf(id)), id];
    return { ids, names: ids.map((i) => book.get(i)?.name ?? i) };
  }

  const recipe = book.get(id);
  if (recipe === undefined) return null;

  const next = [...trail, id];
  for (const component of recipe.components) {
    if (component.kind !== 'recipe') continue;
    const found = walk(component.childId, book, next);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The loop a recipe already contains, or null.
 *
 * Exists alongside the check inside `recipeCost` on purpose. That one throws
 * partway through a calculation, which is right for a guarantee and wrong for
 * an interface: a screen wants to know before it offers the option, not after
 * the operator has clicked it.
 */
export function findCycle(recipe: Recipe, book: RecipeBook): CyclePath | null {
  const next = [recipe.id];
  for (const component of recipe.components) {
    if (component.kind !== 'recipe') continue;
    const found = walk(component.childId, book, next);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The loop that adding `childId` to `parent` would close, or null.
 *
 * A recipe cannot contain itself, at any depth. Without this one bad edit
 * hangs the costing forever, so the same rule is enforced twice — here for the
 * user experience, and by a Postgres trigger for integrity at write time. Two
 * implementations of one rule only stay in agreement if they share a test
 * list (TRD 2, 6.5).
 */
export function wouldCycle(
  parent: Recipe,
  childId: string,
  book: RecipeBook,
): CyclePath | null {
  if (childId === parent.id) {
    return { ids: [parent.id, parent.id], names: [parent.name, parent.name] };
  }
  return walk(childId, book, [parent.id]);
}

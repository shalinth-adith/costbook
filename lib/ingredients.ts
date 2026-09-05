/**
 * The ingredients screen.
 *
 * One ingredient, entered once, priced once. Onion at 42.00 a kilo makes 500 g
 * cost 21.00 in every recipe that uses it, until the price changes - which is
 * the whole argument for holding them by reference rather than by copy (A19).
 */

import {
  STALE_AFTER_DAYS,
  ageInDays,
  ingredientCost,
  ratePerUnit,
  type Ingredient,
} from '@/core/ingredient';
import type { RateChange } from './org';
import type { Pantry } from '@/core/recipe';

export type IngredientFilter = 'all' | 'no_rate' | 'stale' | 'locked' | 'assumed';
export type IngredientStatus = 'ok' | 'no_rate' | 'stale' | 'locked';

export interface IngredientRow {
  readonly id: string;
  readonly name: string;
  /** "50 kg", the way the operator would say what they buy. */
  readonly pack: string;
  readonly supplier: string | null;
  /** What a unit costs as bought. Null when there is no rate on file. */
  readonly rate: number | null;
  /**
   * What a usable unit costs, after peeling and trimming. Equal to the bought
   * rate at 100% yield, which is why leaving that field alone costs nothing.
   */
  readonly usableRate: number | null;
  readonly unit: string;
  readonly yieldPercent: number;
  readonly yieldIsAssumed: boolean;
  readonly usedIn: number;
  readonly pricedAt: string | null;
  readonly ageDays: number | null;
  readonly lockedBy: string | null;
  readonly status: IngredientStatus;
  /**
   * What this ingredient has cost before, newest first (A28). Empty until it
   * has been repriced once — a first rate is not a change.
   */
  readonly history: readonly RateChange[];
}

export interface IngredientBoard {
  readonly rows: readonly IngredientRow[];
  readonly counts: Readonly<Record<IngredientFilter, number>>;
}

/** How many recipes reach an ingredient, directly or through a sub-recipe. */
function usageCounts(pantry: Pantry): ReadonlyMap<string, number> {
  const direct = new Map<string, Set<string>>();

  const walk = (recipeId: string, rootId: string, seen: Set<string>): void => {
    if (seen.has(recipeId)) return;
    seen.add(recipeId);
    const recipe = pantry.recipes.get(recipeId);
    if (recipe === undefined) return;

    for (const c of recipe.components) {
      if (c.kind === 'ingredient') {
        const set = direct.get(c.ingredientId) ?? new Set<string>();
        set.add(rootId);
        direct.set(c.ingredientId, set);
      } else if (c.kind === 'recipe') {
        walk(c.childId, rootId, seen);
      }
    }
  };

  for (const recipe of pantry.recipes.values()) walk(recipe.id, recipe.id, new Set());
  return new Map([...direct].map(([id, set]) => [id, set.size]));
}

function baseFactor(unit: string): number {
  const table: Record<string, number> = {
    g: 1, kg: 1000, mg: 0.001, ml: 1, l: 1000, pcs: 1, pc: 1, nos: 1,
  };
  return table[unit] ?? 1;
}

function packOf(ingredient: Ingredient): string {
  const shown = ingredient.purchaseQty / baseFactor(ingredient.purchaseUnit);
  const qty = Number.isInteger(shown) ? String(shown) : shown.toFixed(2);
  return `${qty} ${ingredient.purchaseUnit}`;
}

/** Older than the account's own limit. The one rule, used everywhere. */
function agedPast(ingredient: Ingredient, today: string, days: number): boolean {
  if (ingredient.purchasePrice === null) return false;
  const age = ageInDays(ingredient, today);
  return age !== null && age >= days;
}

export function board(
  ingredients: readonly Ingredient[],
  pantry: Pantry,
  today: string,
  /** Looked up per ingredient. Omitted where history is not wanted. */
  historyOf: (id: string) => readonly RateChange[] = () => [],
  /**
   * From Settings. It used the constant in `core/ingredient`, so an owner who
   * set 30 days was still shown "stale" at 90 here while the dashboard used
   * their figure — the same ingredient, two answers, on one book.
   */
  staleAfterDays: number = STALE_AFTER_DAYS,
): IngredientBoard {
  const used = usageCounts(pantry);

  const rows: IngredientRow[] = ingredients.map((i) => {
    const cost = ingredientCost(i);
    const status: IngredientStatus =
      i.purchasePrice === null
        ? 'no_rate'
        : i.lockedBy !== undefined
          ? 'locked'
          : agedPast(i, today, staleAfterDays)
            ? 'stale'
            : 'ok';

    return {
      id: i.id,
      name: i.name,
      pack: packOf(i),
      supplier: i.supplier ?? null,
      rate: ratePerUnit(cost.ratePerBaseUnit, i.purchaseUnit),
      usableRate: ratePerUnit(cost.effectivePerBaseUnit, i.purchaseUnit),
      unit: i.purchaseUnit,
      yieldPercent: i.yieldPercent,
      yieldIsAssumed: i.yieldIsAssumed,
      usedIn: used.get(i.id) ?? 0,
      pricedAt: i.pricedAt ?? null,
      ageDays: ageInDays(i, today),
      lockedBy: i.lockedBy ?? null,
      status,
      history: historyOf(i.id),
    };
  });

  /**
   * Most recently priced first, not alphabetical. What someone is maintaining
   * is what they touched last, and market-day updates arrive in clusters.
   * Alphabetical sorting serves a filing cabinet, not a chef (A19).
   */
  const sorted = [...rows].sort((a, b) => {
    if (a.pricedAt === null && b.pricedAt === null) return a.name.localeCompare(b.name);
    if (a.pricedAt === null) return 1;
    if (b.pricedAt === null) return -1;
    return b.pricedAt.localeCompare(a.pricedAt);
  });

  return {
    rows: sorted,
    counts: {
      all: sorted.length,
      no_rate: sorted.filter((r) => r.status === 'no_rate').length,
      stale: sorted.filter((r) => r.status === 'stale').length,
      locked: sorted.filter((r) => r.status === 'locked').length,
      /*
       * Yields nobody has confirmed. Not a status — an ingredient can be
       * perfectly priced, fresh and still costed as though nothing is lost
       * to peel and trim, which is why this sits beside the statuses rather
       * than among them.
       */
      assumed: sorted.filter((r) => r.yieldIsAssumed && r.rate !== null && r.usedIn > 0).length,
    },
  };
}

export function applyIngredientFilter(
  rows: readonly IngredientRow[],
  filter: IngredientFilter,
  query: string,
): readonly IngredientRow[] {
  const q = query.trim().toLowerCase();

  return rows.filter((r) => {
    if (filter === 'no_rate' && r.status !== 'no_rate') return false;
    if (filter === 'stale' && r.status !== 'stale') return false;
    if (filter === 'locked' && r.status !== 'locked') return false;
    if (filter === 'assumed' && !(r.yieldIsAssumed && r.rate !== null && r.usedIn > 0)) return false;
    if (q !== '') {
      const inName = r.name.toLowerCase().includes(q);
      const inSupplier = (r.supplier ?? '').toLowerCase().includes(q);
      if (!inName && !inSupplier) return false;
    }
    return true;
  });
}

/**
 * Ingredients that look like what is being typed.
 *
 * Type-ahead here is duplicate prevention, not convenience. Two entries for one
 * ingredient is the failure that quietly makes costing wrong, and the entry row
 * is the only place to catch it (A19).
 */
export function nearMatches(
  rows: readonly IngredientRow[],
  name: string,
  limit = 3,
): readonly IngredientRow[] {
  const q = name.trim().toLowerCase();
  if (q.length < 2) return [];

  return rows.filter((r) => r.name.toLowerCase().includes(q)).slice(0, limit);
}

export interface DerivedRate {
  /** What one unit costs, from the pack quantity and the pack price. */
  readonly perUnit: number | null;
  /** A worked example, because reassurance is worth more before the keystroke. */
  readonly sampleQty: number;
  readonly sampleCost: number | null;
}

/**
 * The rate a pack implies, shown under the entry row as it is typed.
 *
 * "1,360.00 / kg, 4 g = 5.44" is a sentence someone can check against what
 * they already know. A figure with no worked example is one they have to trust.
 */
export function deriveRate(
  packQty: number,
  unit: string,
  packPrice: number | null,
): DerivedRate {
  const large = unit === 'kg' || unit === 'l';
  const sampleQty = large ? 100 : 1;

  if (packPrice === null || !Number.isFinite(packQty) || packQty <= 0) {
    return { perUnit: null, sampleQty, sampleCost: null };
  }

  const perUnit = packPrice / packQty;
  const sampleInUnit = large ? sampleQty / 1000 : sampleQty;
  return { perUnit, sampleQty, sampleCost: perUnit * sampleInUnit };
}

/** The unit a worked example is written in: grams for a kilo, ml for a litre. */
export function sampleUnit(unit: string): string {
  if (unit === 'kg') return 'g';
  if (unit === 'l') return 'ml';
  return unit;
}

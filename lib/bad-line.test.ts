/**
 * A line with no quantity must never take a screen down.
 *
 * This reproduces a crash found from a screenshot: a component built with a
 * quantity of zero passed construction, was stored, and only threw when
 * something tried to cost it — in a useMemo, inside a client component, which
 * meant the whole page fell to the error boundary reading SOMETHING BROKE.
 */
import { describe, expect, it } from 'vitest';

import { RecipeError, ingredientComponent, pantryOf, recipeComponent } from '@/core/recipe';

import { tryRecipeCost } from './costing';
import { dashboard } from './dashboard';
import { meta, recipes, shelf } from './data';

const priced = shelf.find((i) => i.purchasePrice !== null);
const model = { wastagePercent: 2, packagingPerPortion: 0.35, foodCostTarget: 32, rounding: 'next_9' as const };

describe('building a line with no quantity', () => {
  it('is refused at construction, not at costing time', () => {
    if (priced === undefined) return;
    expect(() => ingredientComponent(priced, 0, priced.purchaseUnit)).toThrow(RecipeError);
    expect(() => ingredientComponent(priced, -5, priced.purchaseUnit)).toThrow(RecipeError);
    expect(() => ingredientComponent(priced, Number.NaN, priced.purchaseUnit)).toThrow(RecipeError);
  });

  it('names the ingredient, so the operator can find the line', () => {
    if (priced === undefined) return;
    try {
      ingredientComponent(priced, 0, priced.purchaseUnit);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(RecipeError);
      expect((e as RecipeError).message).toContain(priced.name);
      expect((e as RecipeError).field).toBe('qty');
    }
  });

  it('refuses a sub-recipe line the same way', () => {
    const child = recipes[0];
    if (child === undefined) return;
    expect(() => recipeComponent(child, 0, child.outputUnit)).toThrow(RecipeError);
  });

  it('still accepts a real quantity', () => {
    if (priced === undefined) return;
    expect(() => ingredientComponent(priced, 250, priced.purchaseUnit)).not.toThrow();
  });
});

describe('a bad line that is already stored', () => {
  // Constructed around the guard, the way old data would arrive.
  const broken = (() => {
    const base = recipes.find((r) => r.components.some((c) => c.kind === 'ingredient'));
    if (base === undefined) return null;
    return {
      ...base,
      id: 'broken-dish',
      name: 'Dish with a bad line',
      components: base.components.map((c, i) => (i === 0 && c.kind !== 'flat' ? { ...c, qty: 0 } : c)),
    };
  })();

  it('reports rather than throws', () => {
    if (broken === null) return;
    const out = tryRecipeCost(broken, pantryOf([...recipes, broken], shelf));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.field).toBe('qty');
      expect(out.message).toContain('quantity');
    }
  });

  it('does not blank the dashboard — the other dishes still rank', () => {
    if (broken === null) return;
    const all = [...recipes, broken];
    const board = dashboard({
      ids: all.map((r) => r.id),
      pantry: pantryOf(all, shelf),
      meta: { ...meta, 'broken-dish': { category: 'Mains', station: null, portionSize: null, sellingPrice: 100, note: '', onMenu: true } },
      model,
    });
    // The bad dish is left out; every good one survives.
    expect(board.rows.some((r) => r.id === 'broken-dish')).toBe(false);
    expect(board.rows.length).toBeGreaterThan(0);
  });
});

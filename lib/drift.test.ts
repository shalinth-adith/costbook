/**
 * Drift since priced: which rates moved after the price was set, among the
 * ones the dish actually reaches.
 */

import { describe, expect, it } from 'vitest';

import type { Ingredient } from '@/core/ingredient';
import type { Recipe } from '@/core/recipe';

import { driftSince, reachedBy } from './drift';

const ing = (id: string, name: string): Ingredient => ({ id, name } as unknown as Ingredient);
const shelf = [ing('onion', 'Onion'), ing('oil', 'Oil'), ing('salt', 'Salt')];

const gravy: Recipe = {
  id: 'gravy', name: 'Gravy', family: 'mass', outputQty: 1000, outputUnit: 'kg', portions: null,
  components: [{ kind: 'ingredient', scope: 'batch', ingredientId: 'onion', qty: 500, unit: 'g', entry: { mode: 'ingredient_rate' } }],
} as Recipe;
const dish: Recipe = {
  id: 'dish', name: 'Dish', family: 'count', outputQty: 10, outputUnit: 'pc', portions: 10,
  components: [
    { kind: 'recipe', scope: 'batch', childId: 'gravy', qty: 200, unit: 'g', entry: { mode: 'ingredient_rate' } },
    { kind: 'ingredient', scope: 'batch', ingredientId: 'oil', qty: 50, unit: 'ml', entry: { mode: 'ingredient_rate' } },
  ],
} as Recipe;

const history = {
  onion: [
    { from: 4.2, to: 5.1, qty: 1000, on: '2026-08-20', source: 'manual' as const },
    { from: 5.1, to: 5.1, qty: 1000, on: '2026-08-28', source: 'confirmed' as const },
  ],
  oil: [{ from: 100, to: 109, qty: 1000, on: '2026-07-02', source: 'manual' as const }],
  salt: [{ from: 1, to: 3, qty: 1000, on: '2026-08-25', source: 'manual' as const }],
};

describe('reachedBy', () => {
  it('walks into the batches a dish uses', () => {
    expect([...reachedBy(dish, [gravy])].sort()).toEqual(['oil', 'onion']);
  });
});

describe('driftSince', () => {
  it('names the rates that moved after the price was set, biggest first', () => {
    const d = driftSince(dish, [gravy], shelf, history, '2026-08-01');
    expect(d.map((x) => x.name)).toEqual(['Onion']);
    expect(d[0]?.percent).toBeCloseTo(21.43, 1);
  });

  it('counts a move before the price was set as already in the price', () => {
    // Oil moved on 2 July; the price was set on 1 August with that rate in it.
    expect(driftSince(dish, [gravy], shelf, history, '2026-08-01').some((x) => x.name === 'Oil')).toBe(false);
    expect(driftSince(dish, [gravy], shelf, history, '2026-06-01').map((x) => x.name)).toEqual(['Onion', 'Oil']);
  });

  it('ignores an ingredient the dish does not reach', () => {
    expect(driftSince(dish, [gravy], shelf, history, '2026-08-01').some((x) => x.name === 'Salt')).toBe(false);
  });

  it('does not read a confirmation as a move', () => {
    const only = { onion: [history.onion[1]!] };
    expect(driftSince(dish, [gravy], shelf, only, '2026-08-01')).toEqual([]);
  });
});

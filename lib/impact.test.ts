import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL } from './costing';
import { meta, recipes, shelf } from './data';
import { headlineFor, impactOf, pathTo } from './impact';

import { pantryOf } from '@/core/recipe';

const model = { ...DEFAULT_MODEL, foodCostTarget: 32 };

/** Move one ingredient's rate and hand back the whole shelf. */
function withRate(id: string, factor: number) {
  return shelf.map((i) =>
    i.id === id && i.purchasePrice !== null
      ? { ...i, purchasePrice: i.purchasePrice * factor }
      : i,
  );
}

const onion = shelf.find((i) => /onion/i.test(i.name));

describe('a rate that moves', () => {
  it('finds the fixture onion to test with', () => {
    expect(onion).toBeDefined();
  });

  it('moves dishes that use it and leaves the rest alone', () => {
    if (onion === undefined) return;
    const out = impactOf({
      recipes, ingredients: shelf, meta, model,
      nextIngredients: withRate(onion.id, 1.43),
      ingredientId: onion.id,
    });

    expect(out.moved.length).toBeGreaterThan(0);
    // Every dish reported must actually have moved.
    for (const m of out.moved) expect(Math.abs(m.costDelta)).toBeGreaterThan(0.005);
  });

  it('costs more when a rate goes up, never less', () => {
    if (onion === undefined) return;
    const out = impactOf({
      recipes, ingredients: shelf, meta, model,
      nextIngredients: withRate(onion.id, 2),
      ingredientId: onion.id,
    });
    for (const m of out.moved) expect(m.costDelta).toBeGreaterThan(0);
  });

  it('reports nothing when the rate does not actually change', () => {
    if (onion === undefined) return;
    const out = impactOf({
      recipes, ingredients: shelf, meta, model,
      nextIngredients: withRate(onion.id, 1),
      ingredientId: onion.id,
    });
    expect(out.moved).toHaveLength(0);
    expect(headlineFor(out, 32)).toBe('No dish changes price.');
  });

  it('puts crossers first', () => {
    if (onion === undefined) return;
    const out = impactOf({
      recipes, ingredients: shelf, meta, model,
      nextIngredients: withRate(onion.id, 3),
      ingredientId: onion.id,
    });
    const firstNonCrosser = out.moved.findIndex((m) => !m.crosses);
    if (firstNonCrosser === -1) return;
    // Nothing after the first non-crosser may be a crosser.
    expect(out.moved.slice(firstNonCrosser).some((m) => m.crosses)).toBe(false);
  });
});

describe('via — the connection nobody holds in their head', () => {
  it('is null for a dish that lists the ingredient itself', () => {
    if (onion === undefined) return;
    const pantry = pantryOf(recipes, shelf);
    const direct = recipes.find((r) =>
      r.components.some((c) => c.kind === 'ingredient' && c.ingredientId === onion.id),
    );
    if (direct === undefined) return;
    expect(pathTo(direct, onion.id, pantry)).toBeNull();
  });

  it('names the sub-recipe for a dish that reaches it indirectly', () => {
    if (onion === undefined) return;
    const pantry = pantryOf(recipes, shelf);
    const named = recipes
      .map((r) => pathTo(r, onion.id, pantry))
      .filter((v): v is string => v !== null);
    // The fixture menu has nesting, so at least one dish must reach it this way.
    expect(named.length).toBeGreaterThan(0);
  });
});

describe('a target that moves — the same event from the other end', () => {
  it('moves food cost without moving any cost', () => {
    const out = impactOf({
      recipes, ingredients: shelf, meta, model,
      nextModel: { ...model, foodCostTarget: 25 },
    });
    expect(out.moved.length).toBeGreaterThan(0);
    for (const m of out.moved) expect(Math.abs(m.costDelta)).toBeLessThan(0.005);
  });

  it('pushes dishes over when the target tightens', () => {
    const loose = impactOf({
      recipes, ingredients: shelf, meta, model,
      nextModel: { ...model, foodCostTarget: 45 },
    });
    const tight = impactOf({
      recipes, ingredients: shelf, meta, model,
      nextModel: { ...model, foodCostTarget: 18 },
    });
    expect(tight.crossCount).toBeGreaterThanOrEqual(loose.crossCount);
  });

  it('has no via to report, because a target has no path', () => {
    const out = impactOf({
      recipes, ingredients: shelf, meta, model,
      nextModel: { ...model, foodCostTarget: 25 },
    });
    for (const m of out.moved) expect(m.via).toBeNull();
  });
});

describe('the headline', () => {
  it('reads as good news when nothing moved', () => {
    const out = impactOf({ recipes, ingredients: shelf, meta, model });
    expect(headlineFor(out, 32)).toBe('No dish changes price.');
  });
});

/**
 * The impact panel's server side, exercised through the real store.
 *
 * `previewRate` is what stands between typing a rate and repricing a menu, so
 * it is worth proving that it reports movement, reports it in the right
 * direction, and writes nothing while doing it.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { previewRate } from '@/app/ingredients/actions';
import { allIngredients, allRecipes, seedForTests } from '@/lib/store';
import { meta as fixtureMeta, recipes as fixtureRecipes, shelf as fixtureShelf } from './data';

/*
 * The store starts empty, as a real account does — there is no fixture café in
 * a running Costbook. These tests exercise writes, so they put the fixture book
 * in first, explicitly.
 */
beforeAll(() => {
  seedForTests({ recipes: fixtureRecipes, ingredients: fixtureShelf, meta: fixtureMeta });
});

// Resolved after the seed lands, not at module load.
const findOnion = () => allIngredients().find((i) => /onion/i.test(i.name) && i.purchasePrice !== null);
let onion: ReturnType<typeof findOnion>;
beforeAll(() => { onion = findOnion(); });

describe('previewing a rate', () => {
  it('finds a priced onion in the seeded book', () => {
    expect(onion).toBeDefined();
  });

  it('reports the old rate, the new one, and the move between them', async () => {
    if (onion === undefined || onion.purchasePrice === null) return;
    const before = onion.purchasePrice;
    const out = await previewRate(onion.id, 999);

    expect(out).not.toBeNull();
    expect(out?.name).toBe(onion.name);
    expect(out?.from).toBeCloseTo(before, 6);
    expect(out?.to).not.toBeNull();
  });

  it('writes nothing — the menu is untouched until it is applied', async () => {
    if (onion === undefined || onion.purchasePrice === null) return;
    const o = onion;
    const was = allIngredients().find((i) => i.id === o.id)?.purchasePrice ?? null;
    const recipesBefore = allRecipes().length;

    await previewRate(o.id, 5000);

    const now = allIngredients().find((i) => i.id === o.id)?.purchasePrice ?? null;
    expect(now).toBe(was);
    expect(allRecipes()).toHaveLength(recipesBefore);
  });

  it('moves dishes up when the rate goes up', async () => {
    if (onion === undefined || onion.purchasePrice === null) return;
    const out = await previewRate(onion.id, 4000);
    expect(out?.impact.moved.length).toBeGreaterThan(0);
    for (const m of out?.impact.moved ?? []) expect(m.costDelta).toBeGreaterThan(0);
  });

  it('says so plainly when nothing moves', async () => {
    const unused = allIngredients().find((i) => {
      const anyUse = allRecipes().some((r) =>
        r.components.some((c) => c.kind === 'ingredient' && c.ingredientId === i.id),
      );
      return !anyUse;
    });
    if (unused === undefined) return;
    const out = await previewRate(unused.id, 123);
    expect(out?.headline).toBe('No dish changes price.');
  });

  it('returns null for an ingredient that is not there', async () => {
    expect(await previewRate('no-such-ingredient', 10)).toBeNull();
  });

  // A first rate is not a rise of infinity; it is an ingredient that had none.
  it('reports no percentage when there was no rate to move from', async () => {
    const unpriced = allIngredients().find((i) => i.purchasePrice === null);
    if (unpriced === undefined) return;
    const out = await previewRate(unpriced.id, 100);
    expect(out?.percent).toBeNull();
  });
});

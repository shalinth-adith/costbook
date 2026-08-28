import { beforeEach, describe, expect, it } from 'vitest';

import { withRate } from '@/core/ingredient';
import { recipeCost } from '@/core/recipe';

import { buildUp } from './costing';
import {
  allIngredients,
  getMeta,
  getRecipe,
  pantry,
  putIngredient,
  putMeta,
  putRecipe,
  recipesUsing,
} from './store';

/**
 * Saving, and what it has to mean.
 *
 * "Save changes" clearing a dirty flag is not saving. These assert the thing
 * the operator actually expects: make a change, and the next read of any
 * screen shows it — the dish itself, and the dashboard it appears on.
 */

const plate = () => {
  const r = getRecipe('plate');
  if (r === undefined) throw new Error('no plate');
  return r;
};

const perPortion = (id: string): number | null => {
  const p = pantry();
  const r = p.recipes.get(id);
  if (r === undefined) throw new Error(`no recipe ${id}`);
  return buildUp(recipeCost(r, p)).total;
};

describe('a component change survives the write', () => {
  it('is there on the next read', () => {
    const before = plate().components.length;
    putRecipe({ ...plate(), components: plate().components.slice(0, -1) });

    expect(getRecipe('plate')?.components).toHaveLength(before - 1);
  });

  it('changes what the dish costs', () => {
    const before = perPortion('plate');
    const current = plate();
    putRecipe({ ...current, portions: (current.portions ?? 1) * 2 });

    // Twice the plates from one batch: each one costs less.
    expect(perPortion('plate') ?? 0).toBeLessThan(before ?? 0);
  });
});

describe('putting a dish on the menu', () => {
  it('records the price and the fact that it is on the menu', () => {
    putMeta('podi-idly', { onMenu: true, sellingPrice: 99 });

    expect(getMeta('podi-idly')?.onMenu).toBe(true);
    expect(getMeta('podi-idly')?.sellingPrice).toBe(99);
  });

  it('taking it off keeps the recipe and drops the price', () => {
    const components = getRecipe('podi-idly')?.components.length;
    putMeta('podi-idly', { onMenu: false, sellingPrice: null });

    expect(getMeta('podi-idly')?.sellingPrice).toBeNull();
    expect(getRecipe('podi-idly')?.components).toHaveLength(components ?? 0);
  });
});

describe('setting a rate is one write that moves everything', () => {
  it('turns a floor into a cost', () => {
    const syrup = allIngredients().find((i) => i.name === 'Nannari syrup');
    if (syrup === undefined) throw new Error('no syrup');

    const before = pantry();
    expect(buildUp(recipeCost(before.recipes.get('jigarthanda')!, before)).complete).toBe(false);

    putIngredient(withRate(syrup, 260));

    const after = pantry();
    expect(buildUp(recipeCost(after.recipes.get('jigarthanda')!, after)).complete).toBe(true);
  });

  it('moves every dish that reaches the ingredient, at any depth', () => {
    const onion = allIngredients().find((i) => i.name === 'Onion, big');
    if (onion === undefined) throw new Error('no onion');

    const affected = recipesUsing(onion.id).map((r) => r.id);
    // The gravy has it directly; the plate only through the kuruma, then the gravy.
    expect(affected).toContain('gravy');
    expect(affected).toContain('plate');

    const before = new Map(affected.map((id) => [id, perPortion(id)]));
    putIngredient(withRate(onion, onion.purchasePrice! * 2));

    for (const id of affected) {
      const was = before.get(id) ?? null;
      const now = perPortion(id);
      // A dish made by the batch has no cost per portion to compare.
      if (was === null || now === null) continue;
      expect(now).toBeGreaterThan(was);
    }
  });

  it('counts what else moved, which is the fact the toast reports', () => {
    const onion = allIngredients().find((i) => i.name === 'Onion, big');
    if (onion === undefined) throw new Error('no onion');
    expect(recipesUsing(onion.id).length).toBeGreaterThan(3);
  });
});

/**
 * A42's three states, and the rule that decides between the last two.
 *
 * The window rule is the load-bearing one. State 3 holds while the rate
 * movement is the newest thing that happened to the dish, with no age limit —
 * a rate that moved on Friday is still the last thing that happened to a dish
 * nobody touched over the weekend. Any time window needs a rule about when the
 * day turns over, and that rule is wrong somewhere and never remembered.
 */

import { describe, expect, it } from 'vitest';

import { flatComponent, ingredientComponent } from '@/core/recipe';

import { DEFAULT_MODEL } from './costing';
import { pantryWith } from './edit';
import { firstDish } from './first-dish';
import type { DishMeta } from './data';
import type { RateChange } from './org';

const GHEE = {
  id: 'ghee', name: 'Ghee', family: 'mass' as const,
  purchaseQty: 1000, purchasePrice: 500, purchaseUnit: 'kg',
  yieldPercent: 100, yieldIsAssumed: true,
};

const DOSA = {
  id: 'dosa', name: 'Ghee Roast Masala Dosa', family: 'mass' as const,
  outputQty: 1000, outputUnit: 'g', portions: 10,
  components: [ingredientComponent(GHEE, 100, 'g')],
};

const SOLD: DishMeta = {
  category: 'Tiffin', station: null, portionSize: null,
  sellingPrice: 129, note: '', onMenu: true,
};

const change = (from: number | null, to: number, on: string): RateChange =>
  ({ from, to, qty: 1000, on, source: 'manual' });

const ask = (over: {
  recipes?: readonly (typeof DOSA)[];
  meta?: Readonly<Record<string, DishMeta>>;
  history?: Readonly<Record<string, readonly RateChange[]>>;
} = {}) => {
  const recipes = over.recipes ?? [DOSA];
  return firstDish({
    recipes,
    pantry: pantryWith(recipes[0] ?? DOSA, recipes, [GHEE]),
    meta: over.meta ?? { dosa: SOLD },
    model: DEFAULT_MODEL,
    history: over.history ?? {},
    ingredientCount: 9,
  });
};

describe('which state', () => {
  it('nothing costed is state one', () => {
    expect(ask({ recipes: [] })).toEqual({ kind: 'none' });
  });

  it('one costed dish, untouched by any rate, is state two', () => {
    const out = ask();
    expect(out?.kind).toBe('one');
    if (out?.kind !== 'one') return;
    expect(out.dish.name).toBe('Ghee Roast Masala Dosa');
    expect(out.dish.costPerPortion).toBeCloseTo(5, 8); // 100g of 500/kg over 10
    expect(out.ingredients).toBe(9);
  });

  it('hands over to the ordinary dashboard once there are two', () => {
    const second = { ...DOSA, id: 'idly', name: 'Podi Idly' };
    expect(ask({ recipes: [DOSA, second], meta: { dosa: SOLD, idly: SOLD } })).toBeNull();
  });

  it('a dish that cannot be costed leaves the page in state one', () => {
    const noRate = { ...GHEE, purchasePrice: null };
    const out = firstDish({
      recipes: [DOSA],
      pantry: pantryWith(DOSA, [DOSA], [noRate]),
      meta: { dosa: SOLD },
      model: DEFAULT_MODEL,
      history: {},
      ingredientCount: 1,
    });
    // A floor is not a cost, so nothing here answers "what does it cost".
    expect(out).toEqual({ kind: 'none' });
  });
});

describe('the window rule', () => {
  it('a rate movement puts the page in state three', () => {
    const out = ask({ history: { ghee: [change(400, 500, '2026-08-31')] } });
    expect(out?.kind).toBe('moved');
    if (out?.kind !== 'moved') return;
    expect(out.move.ingredient).toBe('Ghee');
    expect(out.move.from).toBe(400);
    expect(out.move.to).toBe(500);
    expect(out.move.rose).toBe(true);
  });

  it('holds however old the movement is', () => {
    // Friday's change, read on Monday. Still the last thing that happened.
    const out = ask({ history: { ghee: [change(400, 500, '2020-01-02')] } });
    expect(out?.kind).toBe('moved');
  });

  it('ends when the operator touches the dish afterwards', () => {
    const out = ask({
      meta: { dosa: { ...SOLD, updatedAt: '2026-08-31' } },
      history: { ghee: [change(400, 500, '2026-08-30')] },
    });
    expect(out?.kind).toBe('one');
  });

  it('survives an edit made before the movement', () => {
    const out = ask({
      meta: { dosa: { ...SOLD, updatedAt: '2026-08-29' } },
      history: { ghee: [change(400, 500, '2026-08-30')] },
    });
    expect(out?.kind).toBe('moved');
  });

  it('an edit on the same day does not end it', () => {
    // Same date, no clock: the movement is not demonstrably older.
    const out = ask({
      meta: { dosa: { ...SOLD, updatedAt: '2026-08-30' } },
      history: { ghee: [change(400, 500, '2026-08-30')] },
    });
    expect(out?.kind).toBe('moved');
  });

  it('reads the newest movement when there are several', () => {
    const out = ask({
      history: { ghee: [change(300, 400, '2026-08-20'), change(400, 500, '2026-08-30')] },
    });
    expect(out?.kind).toBe('moved');
    if (out?.kind !== 'moved') return;
    expect(out.move.from).toBe(400);
  });

  it('the first rate an ingredient ever carried is not a movement', () => {
    expect(ask({ history: { ghee: [change(null, 500, '2026-08-30')] } })?.kind).toBe('one');
  });

  it('a confirmation that changed nothing is not a movement', () => {
    const confirmed: RateChange = { from: 500, to: 500, qty: 1000, on: '2026-08-31', source: 'confirmed' };
    expect(ask({ history: { ghee: [confirmed] } })?.kind).toBe('one');
  });
});

describe('what the movement did', () => {
  it('computes the food cost as it stood before, from the old pack price', () => {
    const out = ask({ history: { ghee: [change(400, 500, '2026-08-30')] } });
    if (out?.kind !== 'moved') throw new Error('expected state three');
    // Before: 100g at 400/kg over 10 portions = 4.00, +2% wastage +0.35 packaging
    // = 4.43 against 129 = 3.434%. After: 5.00 -> 5.45 = 4.225%.
    expect(out.move.wasFoodCostPercent).toBeCloseTo(3.434, 2);
    expect(out.dish.foodCostPercent).toBeCloseTo(3.876, 2);
    expect(out.move.wasFoodCostPercent ?? 0).toBeLessThan(out.dish.foodCostPercent ?? 0);
  });

  it('divides the old price by the pack it was actually for', () => {
    // The supplier moved from a 500g tin at 300 to a 1kg tin at 500. Dividing
    // 300 by today's kilo would report a fall where there was a rise.
    const packChanged: RateChange = { from: 300, to: 500, qty: 500, on: '2026-08-30', source: 'manual' };
    const out = ask({ history: { ghee: [packChanged] } });
    if (out?.kind !== 'moved') throw new Error('expected state three');
    // Before: 100g at 600/kg over 10 = 6.00 -> 6.47 = 5.014%. A rise to 500/kg
    // is a fall in the rate, and the figures have to say so.
    expect(out.move.wasFoodCostPercent).toBeCloseTo(5.014, 2);
    expect(out.move.wasFoodCostPercent ?? 0).toBeGreaterThan(out.dish.foodCostPercent ?? 0);
    // The price rose and the rate fell. The sentence must follow the rate.
    expect(out.move.rose).toBe(false);
  });

  it('has no "was" to report when the dish carries no price', () => {
    const out = ask({
      meta: { dosa: { ...SOLD, sellingPrice: null, onMenu: false } },
      history: { ghee: [change(400, 500, '2026-08-30')] },
    });
    if (out?.kind !== 'moved') throw new Error('expected state three');
    expect(out.move.wasFoodCostPercent).toBeNull();
    expect(out.dish.foodCostPercent).toBeNull();
  });
});

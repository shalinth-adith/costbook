import { describe, expect, it } from 'vitest';

import {
  ASSUMED_YIELD_PERCENT,
  type Ingredient,
  IngredientError,
  ingredientCost,
  ingredientFromPack,
  isPriced,
  ratePerUnit,
} from './ingredient.js';
// ratePerUnit rather than fromBase: rates invert against quantities.


/** Everything an operator types, and nothing they did not. */
function onion(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    name: 'Onion, big',
    family: 'mass',
    purchaseQty: 1000, // 1 kg in base units
    purchasePrice: 40,
    purchaseUnit: 'kg',
    yieldPercent: 80,
    yieldIsAssumed: false,
    ...overrides,
  };
}

describe('the acceptance check for build step 3', () => {
  it('costs onion at 40 a kg with 80% yield at 50 a kg of usable onion', () => {
    const cost = ingredientCost(onion());

    expect(cost.priced).toBe(true);
    expect(cost.ratePerBaseUnit).toBeCloseTo(0.04, 12); // 40 / 1000 g
    expect(cost.effectivePerBaseUnit).toBeCloseTo(0.05, 12); // 0.04 / 0.8

    // Read back in the unit the operator thinks in.
    expect(ratePerUnit(cost.effectivePerBaseUnit, 'kg')).toBeCloseTo(50, 10);
  });

  it('reaches the same figure from what the operator actually typed', () => {
    const cost = ingredientCost(
      ingredientFromPack({
        name: 'Onion, big',
        family: 'mass',
        packQty: 1,
        packUnit: 'kg',
        packPrice: 40,
        yieldPercent: 80,
      }),
    );

    expect(ratePerUnit(cost.effectivePerBaseUnit, 'kg')).toBeCloseTo(50, 10);
  });
});

describe('no rate on file is not a rate of zero', () => {
  // The rule this module exists to enforce. A guessed figure is worse than a
  // missing one because it passes validation and silently understates a dish.

  it('reports an unpriced ingredient as unknown, not as free', () => {
    const cost = ingredientCost(onion({ purchasePrice: null }));

    expect(cost.priced).toBe(false);
    expect(cost.ratePerBaseUnit).toBeNull();
    expect(cost.effectivePerBaseUnit).toBeNull();
    expect(cost.effectivePerBaseUnit).not.toBe(0);
  });

  it('reports a genuinely free ingredient as costing zero', () => {
    // Water carries a quantity and yield meaning, and costs nothing (TRD 7.1).
    const water = ingredientCost(
      onion({ name: 'Water', family: 'volume', purchasePrice: 0, yieldPercent: 100 }),
    );

    expect(water.priced).toBe(true);
    expect(water.effectivePerBaseUnit).toBe(0);
  });

  it('keeps the two distinguishable', () => {
    expect(isPriced(onion({ purchasePrice: null }))).toBe(false);
    expect(isPriced(onion({ purchasePrice: 0 }))).toBe(true);
  });

  it('carries the absence through the pack constructor untouched', () => {
    const unpriced = ingredientFromPack({
      name: 'Milagai podi, house',
      family: 'mass',
      packQty: 1,
      packUnit: 'kg',
      packPrice: null,
    });

    expect(unpriced.purchasePrice).toBeNull();
    expect(ingredientCost(unpriced).priced).toBe(false);
  });
});

describe('values the operator did not enter are marked as ours', () => {
  it('assumes no loss when no yield is given, and says so', () => {
    const noYield = ingredientFromPack({
      name: 'Salt, iodised',
      family: 'mass',
      packQty: 1,
      packUnit: 'kg',
      packPrice: 22,
    });

    expect(noYield.yieldPercent).toBe(ASSUMED_YIELD_PERCENT);
    expect(noYield.yieldIsAssumed).toBe(true);

    const cost = ingredientCost(noYield);
    expect(cost.assumed).toHaveLength(1);
    expect(cost.assumed[0]?.field).toBe('yieldPercent');
    expect(cost.assumed[0]?.value).toBe(100);
    expect(cost.assumed[0]?.because).toContain('No yield on file');
  });

  it('claims nothing when the operator entered every figure', () => {
    expect(ingredientCost(onion()).assumed).toHaveLength(0);
  });

  it('does not mark an explicit 100 as assumed', () => {
    const explicit = ingredientFromPack({
      name: 'Ghee, Aavin',
      family: 'mass',
      packQty: 1,
      packUnit: 'kg',
      packPrice: 620,
      yieldPercent: 100,
    });

    expect(explicit.yieldIsAssumed).toBe(false);
    expect(ingredientCost(explicit).assumed).toHaveLength(0);
  });
});

describe('yield makes the usable portion dearer', () => {
  it('leaves the rate alone at 100%', () => {
    const cost = ingredientCost(onion({ yieldPercent: 100 }));
    expect(cost.effectivePerBaseUnit).toBe(cost.ratePerBaseUnit);
  });

  it('scales the rate by the reciprocal of the yield', () => {
    const cases: readonly (readonly [number, number])[] = [
      [100, 40],
      [80, 50],
      [62, 40 / 0.62], // grated coconut
      [50, 80],
      [25, 160],
    ];

    for (const [yieldPercent, expectedPerKg] of cases) {
      const cost = ingredientCost(onion({ yieldPercent }));
      expect(ratePerUnit(cost.effectivePerBaseUnit, 'kg')).toBeCloseTo(expectedPerKg, 8);
    }
  });

  it('holds full precision rather than rounding as it goes', () => {
    // 70% yield on coriander at 280 a kg is 400 exactly; a rate rounded to 2dp
    // mid-calculation multiplies back out across the batch (TRD 4).
    const coriander = ingredientCost(
      onion({ purchasePrice: 280, yieldPercent: 70 }),
    );
    expect(ratePerUnit(coriander.effectivePerBaseUnit, 'kg')).toBeCloseTo(400, 9);
  });
});

describe('figures that cannot be costed are refused, not repaired', () => {
  it('refuses a pack that holds nothing', () => {
    for (const purchaseQty of [0, -1, Number.NaN]) {
      expect(() => ingredientCost(onion({ purchaseQty }))).toThrowError(IngredientError);
    }
  });

  it('refuses a negative price but allows an absent one', () => {
    expect(() => ingredientCost(onion({ purchasePrice: -1 }))).toThrowError(IngredientError);
    expect(() => ingredientCost(onion({ purchasePrice: null }))).not.toThrow();
  });

  it('refuses a yield outside 0 to 100', () => {
    for (const yieldPercent of [0, -10, 101, Number.NaN]) {
      expect(() => ingredientCost(onion({ yieldPercent }))).toThrowError(IngredientError);
    }
  });

  it('names the field so the interface can attach the message to it', () => {
    try {
      ingredientCost(onion({ yieldPercent: 0 }));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as IngredientError).code).toBe('invalid_yield');
      expect((error as IngredientError).field).toBe('yieldPercent');
    }
  });
});

describe('reading a rate back in the operator unit', () => {
  it('multiplies where a quantity would divide', () => {
    // The inversion ratePerUnit exists to hold: 0.05 per gram is 50 per kg,
    // not 0.00005 per kg.
    expect(ratePerUnit(0.05, 'kg')).toBeCloseTo(50, 10);
    expect(ratePerUnit(0.62, 'kg')).toBeCloseTo(620, 10);
    expect(ratePerUnit(0.148, 'l')).toBeCloseTo(148, 10);
    expect(ratePerUnit(1.1, 'pcs')).toBeCloseTo(1.1, 10);
  });

  it('keeps an unknown rate unknown', () => {
    expect(ratePerUnit(null, 'kg')).toBeNull();
  });
});

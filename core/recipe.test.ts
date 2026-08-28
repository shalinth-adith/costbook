import { describe, expect, it } from 'vitest';

import { type Ingredient, ingredientFromPack } from './ingredient.js';
import {
  type Recipe,
  RecipeError,
  flatComponent,
  ingredientComponent,
  isComplete,
  recipeCost,
} from './recipe.js';

function pack(
  name: string,
  packQty: number,
  packUnit: string,
  packPrice: number | null,
  yieldPercent = 100,
): Ingredient {
  const family =
    packUnit === 'l' || packUnit === 'ml' ? 'volume' : packUnit === 'pcs' ? 'count' : 'mass';
  return ingredientFromPack({ name, family, packQty, packUnit, packPrice, yieldPercent });
}

/**
 * Filter Coffee, a batch of 10. Hand-costed:
 *   coffee powder  120 g  at 480.00/kg =  57.60
 *   milk         1,500 ml at  60.00/l  =  90.00
 *   sugar          100 g  at  45.80/kg =   4.58
 *                                batch = 152.18, per portion 15.218
 */
function filterCoffee(): Recipe {
  return {
    name: 'Filter Coffee',
    portions: 10,
    components: [
      ingredientComponent(pack('Coffee powder', 1, 'kg', 480), 120, 'g'),
      ingredientComponent(pack('Milk, toned', 1, 'l', 60), 1500, 'ml'),
      ingredientComponent(pack('Sugar', 50, 'kg', 2290), 100, 'g'),
    ],
  };
}

/**
 * The reference workbook's split, J = (SUM(G4:G10) - G10) / I4 + G10.
 * Dosa batter for 125 plates, with 4 g of ghee drizzled on each one.
 *   batch pool  = 740.64
 *   ghee line   =   2.48, applied to every plate rather than divided across them
 */
function gheeDosa(gheeScope: 'batch' | 'portion'): Recipe {
  return {
    name: 'Ghee Roast Dosa',
    portions: 125,
    components: [
      ingredientComponent(pack('Dosa rice', 1, 'kg', 60), 8000, 'g'),
      ingredientComponent(pack('Urad dal', 1, 'kg', 120), 2000, 'g'),
      ingredientComponent(pack('Fenugreek', 1, 'kg', 180), 100, 'g'),
      ingredientComponent(pack('Salt, iodised', 1, 'kg', 22), 120, 'g'),
      ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620), 4, 'g', { scope: gheeScope }),
    ],
  };
}

describe('the acceptance check for build step 5', () => {
  it('matches the ghee-per-portion dish by hand', () => {
    const cost = recipeCost(gheeDosa('portion'));
    if (!isComplete(cost)) expect.unreachable('every line is priced');

    expect(cost.batch).toBeCloseTo(740.64, 10);
    expect(cost.portionAdd).toBeCloseTo(2.48, 10);
    expect(cost.perPortion).toBeCloseTo(8.40512, 10); // 740.64/125 + 2.48
    expect(cost.total).toBeCloseTo(1050.64, 8); // 740.64 + 2.48 x 125
  });

  it('is wrong by the price of the ghee if everything is divided by portions', () => {
    // Any model without a per-portion pool gets this dish wrong (TRD 6.2).
    const right = recipeCost(gheeDosa('portion'));
    const wrong = recipeCost(gheeDosa('batch'));
    if (!isComplete(right) || !isComplete(wrong)) expect.unreachable('all priced');

    expect(wrong.perPortion).toBeCloseTo(5.94496, 10);
    expect(right.perPortion - wrong.perPortion).toBeCloseTo(2.46016, 10);
  });

  it('adds a lot line to the cost without touching yield or quantity', () => {
    const withLot: Recipe = {
      ...gheeDosa('portion'),
      components: [...gheeDosa('portion').components, flatComponent('Blending', 50)],
    };

    const cost = recipeCost(withLot);
    if (!isComplete(cost)) expect.unreachable('every line is priced');

    expect(cost.batch).toBeCloseTo(790.64, 10); // 740.64 + 50
    expect(cost.perPortion).toBeCloseTo(8.80512, 10);

    const lot = cost.lines.find((l) => l.name === 'Blending');
    expect(lot?.kind).toBe('flat');
    expect(lot?.qty).toBe(0);
    expect(lot?.unit).toBe('');
    expect(lot?.ratePerBaseUnit).toBeNull();
  });
});

describe('the two pools', () => {
  it('defaults every line to the batch pool', () => {
    const cost = recipeCost(filterCoffee());
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.lines.every((l) => l.scope === 'batch')).toBe(true);
    expect(cost.portionAdd).toBe(0);
    expect(cost.batch).toBeCloseTo(152.18, 10);
    expect(cost.perPortion).toBeCloseTo(15.218, 10);
  });

  it('applies a per-portion line once to every portion in the total', () => {
    // A chutney cup that goes out with every order.
    const plate: Recipe = {
      name: 'Podi Idly Mini',
      portions: 4,
      components: [
        ingredientComponent(pack('Idly batter', 1, 'kg', 48), 500, 'g'),
        ingredientComponent(pack('Chutney cup, 30 ml', 1, 'pcs', 1.1), 1, 'pcs', {
          scope: 'portion',
        }),
      ],
    };

    const cost = recipeCost(plate);
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.batch).toBeCloseTo(24, 10);
    expect(cost.portionAdd).toBeCloseTo(1.1, 10);
    expect(cost.perPortion).toBeCloseTo(7.1, 10); // 24/4 + 1.10
    expect(cost.total).toBeCloseTo(28.4, 10); // 24 + 1.10 x 4
  });

  it('lets a flat line be per-portion too, which is how packaging lands', () => {
    // COSTING_MODELS Axis A: packaging is a per-portion amount, and is an
    // ordinary scope='portion' component under the hood.
    const boxed: Recipe = {
      name: 'Delivery box',
      portions: 4,
      components: [
        ingredientComponent(pack('Biryani rice', 1, 'kg', 129.6), 1000, 'g'),
        flatComponent('Packaging', 0.35, 'portion'),
      ],
    };

    const cost = recipeCost(boxed);
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.batch).toBeCloseTo(129.6, 10);
    expect(cost.portionAdd).toBeCloseTo(0.35, 10);
    expect(cost.perPortion).toBeCloseTo(32.75, 10); // 129.60/4 + 0.35
  });
});

describe('rate or spend, either direction', () => {
  // 251 lines in the reference workbook derive the rate from the spend.

  it('derives the line cost from a rate the operator typed', () => {
    const cost = recipeCost({
      name: 'Rate entered',
      portions: 1,
      components: [
        ingredientComponent(pack('Refined oil', 15, 'l', 2220), 600, 'ml', { ratePerUnit: 200, rateUnit: 'l' }),
      ],
    });
    if (!isComplete(cost)) expect.unreachable('all priced');

    // 0.20 per ml typed, so the shelf rate of 0.148 is overridden.
    expect(cost.batch).toBeCloseTo(120, 10);
  });

  it('derives the rate from a spend the operator typed', () => {
    // "This batch used 0.6 litres of oil and that cost 3.76."
    const cost = recipeCost({
      name: 'Spend entered',
      portions: 1,
      components: [
        ingredientComponent(pack('Refined oil', 15, 'l', 2220), 0.6, 'l', { spend: 3.76 }),
      ],
    });
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.batch).toBe(3.76);
    expect(cost.lines[0]?.ratePerBaseUnit).toBeCloseTo(3.76 / 600, 12);
    expect(cost.lines[0]?.entryMode).toBe('spend');
  });

  it('derives the rate at full precision rather than rounding it first', () => {
    // The workbook's ROUND(G/D, 2) bakes rounding into a stored rate which
    // then multiplies back out across the batch (TRD 6.6).
    const cost = recipeCost({
      name: 'Precision',
      portions: 1,
      components: [
        ingredientComponent(pack('Coriander leaves', 1, 'kg', 280), 15, 'g', { spend: 6.97 }),
      ],
    });
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.lines[0]?.ratePerBaseUnit).toBeCloseTo(0.46466666666, 10);
    expect(cost.lines[0]?.ratePerBaseUnit).not.toBe(0.46);
  });

  it('remembers which figure the operator typed', () => {
    const shelf = pack('Ghee, Aavin', 1, 'kg', 620);
    const lines = recipeCost({
      name: 'Three ways',
      portions: 1,
      components: [
        ingredientComponent(shelf, 10, 'g'),
        ingredientComponent(shelf, 10, 'g', { ratePerUnit: 640 }),
        ingredientComponent(shelf, 10, 'g', { spend: 6.0 }),
      ],
    }).lines;

    expect(lines.map((l) => l.entryMode)).toEqual(['ingredient_rate', 'rate', 'spend']);
  });

  it('lets a line entered as a spend cost even when the shelf has no rate', () => {
    // The faked sub-recipe case: "Poriya (side), 13 portion @ 0.50".
    const cost = recipeCost({
      name: 'Priced by hand',
      portions: 1,
      components: [
        ingredientComponent(pack('Milagai podi, house', 1, 'kg', null), 8, 'g', { spend: 3.56 }),
      ],
    });

    expect(cost.kind).toBe('cost');
    if (!isComplete(cost)) expect.unreachable('the operator priced the line');
    expect(cost.batch).toBe(3.56);
  });

  it('refuses a rate and a spend on the same line', () => {
    expect(() =>
      ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620), 10, 'g', {
        ratePerUnit: 640,
        rateUnit: 'kg',
        spend: 6.4,
      }),
    ).toThrowError(RecipeError);
  });
});

describe('yield, and when it does and does not apply', () => {
  it('applies to a rate the operator typed, because yield is a property of the thing bought', () => {
    // 200 g of onion at a typed 40/kg with 88% yield: 200 x (0.04/0.88) = 9.0909
    const cost = recipeCost({
      name: 'Typed rate',
      portions: 1,
      components: [
        ingredientComponent(pack('Onion, big', 1, 'kg', 35, 88), 200, 'g', { ratePerUnit: 40, rateUnit: 'kg' }),
      ],
    });
    if (!isComplete(cost)) expect.unreachable('all priced');
    expect(cost.batch).toBeCloseTo(9.090909090909, 10);
  });

  it('does not apply to a spend, which already contains it', () => {
    const cost = recipeCost({
      name: 'Typed spend',
      portions: 1,
      components: [
        ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 200, 'g', { spend: 9.09 }),
      ],
    });
    if (!isComplete(cost)) expect.unreachable('all priced');
    expect(cost.batch).toBe(9.09);
  });

  it('does not apply to a flat line at all', () => {
    // A blending charge has no weight, so there is nothing to lose (TRD 6.3).
    const cost = recipeCost({
      name: 'Charge only',
      portions: 2,
      components: [flatComponent('Blending', 50)],
    });
    if (!isComplete(cost)) expect.unreachable('a flat line always has an amount');
    expect(cost.batch).toBe(50);
    expect(cost.perPortion).toBe(25);
  });
});

describe('a missing rate produces a floor, not a cost', () => {
  function withUnpriced(): Recipe {
    return {
      name: 'Ghee Podi Idly Fry',
      portions: 4,
      components: [
        ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620), 15, 'g'),
        ingredientComponent(pack('Milagai podi, house', 1, 'kg', null), 8, 'g'),
        ingredientComponent(pack('Curry leaves', 1, 'kg', 335), 4, 'g'),
      ],
    };
  }

  it('reports a floor and names the lines that caused it', () => {
    const cost = recipeCost(withUnpriced());
    if (cost.kind !== 'floor') expect.unreachable('one line has no rate');

    expect(cost.batchFloor).toBeCloseTo(10.64, 10); // 9.30 + 1.34
    expect(cost.perPortionFloor).toBeCloseTo(2.66, 10);
    expect(cost.unpriced.map((u) => u.name)).toEqual(['Milagai podi, house']);
  });

  it('leaves the unpriced line blank rather than zero', () => {
    const podi = recipeCost(withUnpriced()).lines.find((l) => l.name === 'Milagai podi, house');
    expect(podi?.cost).toBeNull();
    expect(podi?.cost).not.toBe(0);
  });

  it('never reports a floor under the field names a cost uses', () => {
    const cost = recipeCost(withUnpriced());
    expect(isComplete(cost)).toBe(false);
    expect('batch' in cost).toBe(false);
    expect('perPortion' in cost).toBe(false);
    expect('total' in cost).toBe(false);
  });

  it('floors the per-portion pool too', () => {
    const cost = recipeCost({
      name: 'Missing garnish',
      portions: 4,
      components: [
        ingredientComponent(pack('Idly batter', 1, 'kg', 48), 500, 'g'),
        ingredientComponent(pack('Milagai podi, house', 1, 'kg', null), 8, 'g', {
          scope: 'portion',
        }),
      ],
    });
    if (cost.kind !== 'floor') expect.unreachable('the podi has no rate');

    expect(cost.batchFloor).toBeCloseTo(24, 10);
    expect(cost.portionAddFloor).toBe(0);
    expect(cost.perPortionFloor).toBeCloseTo(6, 10);
  });

  it('treats a free ingredient as costed, not as missing', () => {
    const cost = recipeCost({
      name: 'Kuruma base',
      portions: 4,
      components: [
        ingredientComponent(pack('Water', 1, 'l', 0), 500, 'ml'),
        ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620), 10, 'g'),
      ],
    });
    if (!isComplete(cost)) expect.unreachable('water is priced at zero');
    expect(cost.batch).toBeCloseTo(6.2, 10);
  });
});

describe('assumptions travel up from the ingredients', () => {
  it('reports an assumed yield against the recipe that used it', () => {
    const noYield = ingredientFromPack({
      name: 'Ghee, Aavin',
      family: 'mass',
      packQty: 1,
      packUnit: 'kg',
      packPrice: 620,
    });

    const cost = recipeCost({
      name: 'Ghee drizzle',
      portions: 2,
      components: [ingredientComponent(noYield, 20, 'g')],
    });

    expect(cost.assumed).toHaveLength(1);
    expect(cost.assumed[0]?.field).toBe('yieldPercent');
  });

  it('claims nothing when the operator entered every figure', () => {
    expect(recipeCost(filterCoffee()).assumed).toHaveLength(0);
  });

  it('claims nothing on a line the operator priced themselves', () => {
    const noYield = ingredientFromPack({
      name: 'Ghee, Aavin',
      family: 'mass',
      packQty: 1,
      packUnit: 'kg',
      packPrice: 620,
    });

    const cost = recipeCost({
      name: 'Priced by hand',
      portions: 2,
      components: [ingredientComponent(noYield, 20, 'g', { spend: 12.4 })],
    });

    expect(cost.assumed).toHaveLength(0);
  });
});

describe('figures that cannot be costed are refused, not repaired', () => {
  it('refuses a batch that makes no portions', () => {
    for (const portions of [0, -2, Number.NaN]) {
      expect(() => recipeCost({ ...filterCoffee(), portions })).toThrowError(RecipeError);
    }
  });

  it('explains the portions rule in the operator language', () => {
    try {
      recipeCost({ ...filterCoffee(), portions: 0 });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RecipeError).code).toBe('invalid_portions');
      expect((error as RecipeError).message).toContain('at least one portion');
    }
  });

  it('refuses a line measured in another family', () => {
    try {
      ingredientComponent(pack('Onion, big', 1, 'kg', 40), 200, 'ml');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RecipeError).code).toBe('family_mismatch');
      expect((error as RecipeError).line).toBe('Onion, big');
      expect((error as RecipeError).message).toContain('density');
    }
  });

  it('refuses a negative flat charge', () => {
    expect(() => flatComponent('Rebate', -10)).toThrowError(RecipeError);
  });

  it('refuses a line with no quantity', () => {
    const zeroQty: Recipe = {
      name: 'Broken',
      portions: 2,
      components: [{ ...ingredientComponent(pack('Sugar', 1, 'kg', 45.8), 1, 'g'), qty: 0 }],
    };
    expect(() => recipeCost(zeroQty)).toThrowError(RecipeError);
  });
});

describe('an empty recipe', () => {
  it('costs nothing and is complete, because nothing is missing', () => {
    const cost = recipeCost({ name: 'New dish', portions: 4, components: [] });
    if (!isComplete(cost)) expect.unreachable('no lines means nothing unpriced');
    expect(cost.batch).toBe(0);
    expect(cost.portionAdd).toBe(0);
    expect(cost.total).toBe(0);
  });
});

describe('regression — the rate unit is stated, never assumed', () => {
  // Found twice while building step 5, from opposite directions. Converting a
  // per-display-unit rate into a per-base-unit rate DIVIDES by the factor;
  // converting back MULTIPLIES. Getting either wrong is off by the factor and
  // reads as a formatting bug rather than a costing one.
  const onion = pack('Onion, big', 1, 'kg', 35, 100);

  const batchOf = (options: Parameters<typeof ingredientComponent>[3]): number => {
    const cost = recipeCost({
      name: 'Rate unit',
      portions: 1,
      components: [ingredientComponent(onion, 200, 'g', options)],
    });
    if (!isComplete(cost)) expect.unreachable('priced');
    return cost.batch;
  };

  it('reads 40 per kg on a gram line as 0.04 per gram', () => {
    expect(batchOf({ ratePerUnit: 40, rateUnit: 'kg' })).toBeCloseTo(8, 10);
  });

  it('reads 0.04 per gram on a gram line the same way', () => {
    expect(batchOf({ ratePerUnit: 0.04, rateUnit: 'g' })).toBeCloseTo(8, 10);
    expect(batchOf({ ratePerUnit: 0.04 })).toBeCloseTo(8, 10); // defaults to the line unit
  });

  it('is not off by the unit factor in either direction', () => {
    const perKg = batchOf({ ratePerUnit: 40, rateUnit: 'kg' });
    expect(perKg).not.toBeCloseTo(8000, 0);
    expect(perKg).not.toBeCloseTo(0.008, 6);
  });

  it('refuses a rate unit from another family', () => {
    expect(() => ingredientComponent(onion, 200, 'g', { ratePerUnit: 40, rateUnit: 'l' }))
      .toThrowError(RecipeError);
  });
});

import { describe, expect, it } from 'vitest';

import { type Ingredient, ingredientFromPack } from './ingredient.js';
import {
  type Recipe,
  RecipeError,
  ingredientComponent,
  isComplete,
  recipeCost,
} from './recipe.js';

function pack(
  name: string,
  packQty: number,
  packUnit: string,
  packPrice: number | null,
  yieldPercent?: number,
): Ingredient {
  const family = packUnit === 'l' || packUnit === 'ml' ? 'volume' : packUnit === 'pcs' ? 'count' : 'mass';
  return ingredientFromPack(
    yieldPercent === undefined
      ? { name, family, packQty, packUnit, packPrice }
      : { name, family, packQty, packUnit, packPrice, yieldPercent },
  );
}

/**
 * Filter Coffee, a batch of 10. Hand-costed:
 *   coffee powder  120 g  at 480.00/kg   =  57.60
 *   milk         1,500 ml at  60.00/l    =  90.00
 *   sugar          100 g  at  45.80/kg   =   4.58
 *                                   batch = 152.18
 *                          per portion    =  15.218
 */
function filterCoffee(): Recipe {
  return {
    name: 'Filter Coffee',
    portions: 10,
    components: [
      // Yields entered explicitly at 100: nothing is lost cleaning these, and
      // saying so is the operator's call, not an assumption of ours.
      ingredientComponent(pack('Coffee powder', 1, 'kg', 480, 100), 120, 'g'),
      ingredientComponent(pack('Milk, toned', 1, 'l', 60, 100), 1500, 'ml'),
      ingredientComponent(pack('Sugar', 50, 'kg', 2290, 100), 100, 'g'),
    ],
  };
}

describe('the acceptance check for build step 4', () => {
  it('matches the hand-costed batch and per-portion figures', () => {
    const cost = recipeCost(filterCoffee());

    expect(cost.kind).toBe('cost');
    if (!isComplete(cost)) expect.unreachable('every line is priced');

    expect(cost.batch).toBeCloseTo(152.18, 10);
    expect(cost.perPortion).toBeCloseTo(15.218, 10);
  });

  it('costs each line the way the workbook does, quantity times rate', () => {
    const cost = recipeCost(filterCoffee());

    expect(cost.lines.map((l) => l.cost)).toEqual([
      expect.closeTo(57.6, 10),
      expect.closeTo(90.0, 10),
      expect.closeTo(4.58, 10),
    ]);
  });

  it('carries yield through into the line cost', () => {
    // Onion 200 g at 40/kg, 88% yield =  9.0909...
    // Coriander 20 g at 280/kg, 70%   =  8.0000
    // Lemon 4 pc at 1.20 each          =  4.8000
    //                            batch = 21.8909...
    const salad: Recipe = {
      name: 'Onion salad cup',
      portions: 4,
      components: [
        ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 200, 'g'),
        ingredientComponent(pack('Coriander leaves', 1, 'kg', 280, 70), 20, 'g'),
        ingredientComponent(pack('Lemon', 1, 'pcs', 1.2, 100), 4, 'pcs'),
      ],
    };

    const cost = recipeCost(salad);
    if (!isComplete(cost)) expect.unreachable('every line is priced');

    expect(cost.batch).toBeCloseTo(21.890909090909, 10);
    expect(cost.perPortion).toBeCloseTo(5.472727272727, 10);
  });
});

describe('a missing rate produces a floor, not a cost', () => {
  // FLOWS 4. A recipe missing one rate has a cost that can only go up, so
  // calling the figure a cost would be a lie.

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

    expect(cost.kind).toBe('floor');
    if (cost.kind !== 'floor') expect.unreachable('one line has no rate');

    // 15 g ghee at 0.62/g = 9.30; 4 g curry leaves at 0.335/g = 1.34
    expect(cost.batchFloor).toBeCloseTo(10.64, 10);
    expect(cost.perPortionFloor).toBeCloseTo(2.66, 10);
    expect(cost.unpriced).toHaveLength(1);
    expect(cost.unpriced[0]?.name).toBe('Milagai podi, house');
  });

  it('leaves the unpriced line blank rather than zero', () => {
    // The reference workbook's one good habit: an incomplete row yields blank,
    // never zero, so a half-entered recipe never looks cheap (TRD Appendix A).
    const cost = recipeCost(withUnpriced());
    const podi = cost.lines.find((l) => l.name === 'Milagai podi, house');

    expect(podi?.cost).toBeNull();
    expect(podi?.cost).not.toBe(0);
  });

  it('never reports a floor under the field names a cost uses', () => {
    const cost = recipeCost(withUnpriced());
    expect(isComplete(cost)).toBe(false);
    expect('batch' in cost).toBe(false);
    expect('perPortion' in cost).toBe(false);
  });

  it('becomes a cost the moment the missing rate is entered', () => {
    const fixed: Recipe = {
      ...withUnpriced(),
      components: [
        ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620), 15, 'g'),
        ingredientComponent(pack('Milagai podi, house', 1, 'kg', 445), 8, 'g'),
        ingredientComponent(pack('Curry leaves', 1, 'kg', 335), 4, 'g'),
      ],
    };

    const cost = recipeCost(fixed);
    if (!isComplete(cost)) expect.unreachable('every line now has a rate');
    expect(cost.batch).toBeCloseTo(14.2, 10); // 9.30 + 3.56 + 1.34
  });

  it('treats a free ingredient as costed, not as missing', () => {
    // Water has a quantity and carries yield meaning, and costs nothing.
    const withWater: Recipe = {
      name: 'Kuruma base',
      portions: 4,
      components: [
        ingredientComponent(pack('Water', 1, 'l', 0), 500, 'ml'),
        ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620), 10, 'g'),
      ],
    };

    const cost = recipeCost(withWater);
    expect(cost.kind).toBe('cost');
    if (!isComplete(cost)) expect.unreachable('water is priced at zero');
    expect(cost.batch).toBeCloseTo(6.2, 10);
  });
});

describe('assumptions travel up from the ingredients', () => {
  it('reports an assumed yield against the recipe that used it', () => {
    const cost = recipeCost({
      name: 'Ghee drizzle',
      portions: 2,
      components: [ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620), 20, 'g')],
    });

    expect(cost.assumed).toHaveLength(1);
    expect(cost.assumed[0]?.field).toBe('yieldPercent');
  });

  it('claims nothing when the operator entered every figure', () => {
    expect(recipeCost(filterCoffee()).assumed).toHaveLength(0);
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
    // 200 ml of an ingredient bought by weight needs a density (TRD 3).
    try {
      ingredientComponent(pack('Onion, big', 1, 'kg', 40), 200, 'ml');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RecipeError).code).toBe('family_mismatch');
      expect((error as RecipeError).line).toBe('Onion, big');
      expect((error as RecipeError).message).toContain('density');
    }
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
    expect(cost.kind).toBe('cost');
    if (!isComplete(cost)) expect.unreachable('no lines means nothing unpriced');
    expect(cost.batch).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import { type Ingredient, ingredientFromPack } from './ingredient.js';
import {
  type Recipe,
  type RecipeComponent,
  RecipeError,
  flatComponent,
  ingredientComponent,
  isComplete,
  recipeBook,
  recipeComponent,
  recipeCost,
} from './recipe.js';
import type { UnitFamily } from './units.js';

function pack(
  name: string,
  packQty: number,
  packUnit: string,
  packPrice: number | null,
  yieldPercent?: number,
): Ingredient {
  const family: UnitFamily =
    packUnit === 'l' || packUnit === 'ml' ? 'volume' : packUnit === 'pcs' ? 'count' : 'mass';
  return ingredientFromPack(
    yieldPercent === undefined
      ? { name, family, packQty, packUnit, packPrice }
      : { name, family, packQty, packUnit, packPrice, yieldPercent },
  );
}

interface DishInput {
  readonly id?: string;
  readonly name: string;
  readonly portions: number | null;
  readonly components: readonly RecipeComponent[];
  readonly family?: UnitFamily;
  readonly outputQty?: number;
  readonly outputUnit?: string;
}

let seq = 0;
function dish(input: DishInput): Recipe {
  seq += 1;
  return {
    id: input.id ?? `r${seq}`,
    name: input.name,
    family: input.family ?? 'mass',
    outputQty: input.outputQty ?? 1000,
    outputUnit: input.outputUnit ?? 'kg',
    portions: input.portions,
    components: input.components,
  };
}

/**
 * Filter Coffee, a batch of 10. Hand-costed:
 *   coffee powder  120 g  at 480.00/kg =  57.60
 *   milk         1,500 ml at  60.00/l  =  90.00
 *   sugar          100 g  at  45.80/kg =   4.58
 *                                batch = 152.18, per portion 15.218
 */
function filterCoffee(): Recipe {
  return dish({
    name: 'Filter Coffee',
    portions: 10,
    family: 'volume',
    outputQty: 2000,
    outputUnit: 'l',
    components: [
      ingredientComponent(pack('Coffee powder', 1, 'kg', 480, 100), 120, 'g'),
      ingredientComponent(pack('Milk, toned', 1, 'l', 60, 100), 1500, 'ml'),
      ingredientComponent(pack('Sugar', 50, 'kg', 2290, 100), 100, 'g'),
    ],
  });
}

/**
 * The reference workbook's split, J = (SUM(G4:G10) - G10) / I4 + G10.
 * Dosa batter for 125 plates, with 4 g of ghee drizzled on each one.
 */
function gheeDosa(gheeScope: 'batch' | 'portion'): Recipe {
  return dish({
    name: 'Ghee Roast Dosa',
    portions: 125,
    outputQty: 10000,
    components: [
      ingredientComponent(pack('Dosa rice', 1, 'kg', 60, 100), 8000, 'g'),
      ingredientComponent(pack('Urad dal', 1, 'kg', 120, 100), 2000, 'g'),
      ingredientComponent(pack('Fenugreek', 1, 'kg', 180, 100), 100, 'g'),
      ingredientComponent(pack('Salt, iodised', 1, 'kg', 22, 100), 120, 'g'),
      ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 4, 'g', { scope: gheeScope }),
    ],
  });
}

/* ------------------------------------------------------------------ *
 * The three-level plate. Hand-costed in full:
 *
 *   Onion Thakkali Gravy   yields 2.50 kg   total 114.56076555   0.0458243/g
 *   Veechu Parotta         yields 24 pc     total 118.64         4.9433333/pc
 *   Chicken Kuruma         yields 4.00 kg   total 512.28815607   0.1280720/g
 *     (contains 240 g of the gravy)
 *   Parotta Kuruma Plate   batch of 6 plates
 *     8 pc parotta + 480 g kuruma  -> batch 101.02124540
 *     12 g ghee per plate          -> portionAdd 7.44
 *                                     per portion 24.27687423
 * ------------------------------------------------------------------ */

function gravy(): Recipe {
  return dish({
    id: 'gravy',
    name: 'Onion Thakkali Gravy',
    portions: null,
    family: 'mass',
    outputQty: 2500,
    outputUnit: 'kg',
    components: [
      ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 1500, 'g'),
      ingredientComponent(pack('Tomato', 1, 'kg', 30, 95), 1000, 'g'),
      ingredientComponent(pack('Refined oil', 1, 'l', 148, 100), 100, 'ml'),
    ],
  });
}

function parotta(): Recipe {
  return dish({
    id: 'parotta',
    name: 'Veechu Parotta',
    portions: null,
    family: 'count',
    outputQty: 24,
    outputUnit: 'pcs',
    components: [
      ingredientComponent(pack('Maida', 1, 'kg', 48, 100), 2000, 'g'),
      ingredientComponent(pack('Refined oil', 1, 'l', 148, 100), 150, 'ml'),
      ingredientComponent(pack('Salt, iodised', 1, 'kg', 22, 100), 20, 'g'),
    ],
  });
}

function kuruma(): Recipe {
  return dish({
    id: 'kuruma',
    name: 'Chicken Kuruma',
    portions: null,
    family: 'mass',
    outputQty: 4000,
    outputUnit: 'kg',
    components: [
      ingredientComponent(pack('Chicken, dressed', 1, 'kg', 220, 100), 2000, 'g'),
      recipeComponent(gravy(), 240, 'g'),
      ingredientComponent(pack('Coconut, grated', 1, 'kg', 190, 62), 200, 'g'),
    ],
  });
}

function plate(): Recipe {
  return dish({
    id: 'plate',
    name: 'Parotta Kuruma Plate',
    portions: 6,
    family: 'count',
    outputQty: 6,
    outputUnit: 'pcs',
    components: [
      recipeComponent(parotta(), 8, 'pcs'),
      recipeComponent(kuruma(), 480, 'g'),
      ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 12, 'g', { scope: 'portion' }),
    ],
  });
}

const kitchen = () => recipeBook([gravy(), parotta(), kuruma(), plate()]);

describe('the acceptance check for build step 6', () => {
  it('costs a three-level plate correctly', () => {
    const cost = recipeCost(plate(), kitchen());
    if (!isComplete(cost)) expect.unreachable('every rate is on file');

    expect(cost.batch).toBeCloseTo(101.0212453955, 9);
    expect(cost.portionAdd).toBeCloseTo(7.44, 10);
    expect(cost.perPortion).toBeCloseTo(24.2768742326, 9);
    expect(cost.total).toBeCloseTo(145.6612453955, 9);
  });

  it('has each level costing correctly on its own', () => {
    const book = kitchen();

    const g = recipeCost(gravy(), book);
    const p = recipeCost(parotta(), book);
    const k = recipeCost(kuruma(), book);
    if (!isComplete(g) || !isComplete(p) || !isComplete(k)) expect.unreachable('all priced');

    expect(g.total).toBeCloseTo(114.5607655502, 9);
    expect(p.total).toBeCloseTo(118.64, 10);
    expect(k.total).toBeCloseTo(512.2881560735, 9);
  });

  it('has a sub-recipe contribute qty times its cost per base unit', () => {
    const book = kitchen();
    const k = recipeCost(kuruma(), book);
    if (!isComplete(k)) expect.unreachable('all priced');

    // 4.00 kg of kuruma costing 512.288 is 0.1280720 per gram.
    expect(k.costPerBase).toBeCloseTo(0.1280720390, 10);

    const cost = recipeCost(plate(), book);
    const kurumaLine = cost.lines.find((l) => l.name === 'Chicken Kuruma');

    expect(kurumaLine?.kind).toBe('recipe');
    expect(kurumaLine?.ratePerBaseUnit).toBeCloseTo(k.costPerBase, 12);
    expect(kurumaLine?.cost).toBeCloseTo(480 * k.costPerBase, 10);
  });

  it('carries a nested yield all the way up', () => {
    // Onion at 88% and coconut at 62% sit two and one levels down. Flatten
    // them to 100% and the plate gets cheaper — which is the error the
    // reference workbook makes by having no links at all.
    const noYield = dish({
      id: 'gravy',
      name: 'Onion Thakkali Gravy',
      portions: null,
      outputQty: 2500,
      outputUnit: 'kg',
      components: [
        ingredientComponent(pack('Onion, big', 1, 'kg', 40, 100), 1500, 'g'),
        ingredientComponent(pack('Tomato', 1, 'kg', 30, 100), 1000, 'g'),
        ingredientComponent(pack('Refined oil', 1, 'l', 148, 100), 100, 'ml'),
      ],
    });

    const real = recipeCost(plate(), kitchen());
    const flat = recipeCost(plate(), recipeBook([noYield, parotta(), kuruma(), plate()]));
    if (!isComplete(real) || !isComplete(flat)) expect.unreachable('all priced');

    expect(real.perPortion ?? 0).toBeGreaterThan(flat.perPortion ?? 0);
  });
});

describe('nesting mechanics', () => {
  it('costs a shared child once and reuses it', () => {
    // A plate reaching the same gravy by two routes must not cost it twice.
    const twice = dish({
      id: 'twice',
      name: 'Double gravy',
      portions: 2,
      outputQty: 1000,
      components: [recipeComponent(gravy(), 100, 'g'), recipeComponent(gravy(), 100, 'g')],
    });

    const cost = recipeCost(twice, recipeBook([gravy(), twice]));
    if (!isComplete(cost)) expect.unreachable('all priced');

    const each = 100 * (114.56076555023924 / 2500);
    expect(cost.batch).toBeCloseTo(each * 2, 9);
  });

  it('refuses a sub-recipe measured in another family', () => {
    // Parotta is made in pieces; it cannot be used by weight.
    try {
      recipeComponent(parotta(), 200, 'g');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RecipeError).code).toBe('family_mismatch');
      expect((error as RecipeError).line).toBe('Veechu Parotta');
    }
  });

  it('refuses a line pointing at a recipe not in the book', () => {
    try {
      recipeCost(plate(), recipeBook([plate(), parotta()]));
      expect.unreachable('the kuruma is missing');
    } catch (error) {
      expect((error as RecipeError).code).toBe('unknown_recipe');
    }
  });

  it('does not hang on a recipe that reaches itself', () => {
    // Named properly at step 7; here it only has to terminate.
    const a = dish({ id: 'a', name: 'A', portions: 1, outputQty: 100, components: [] });
    const b = dish({
      id: 'b',
      name: 'B',
      portions: 1,
      outputQty: 100,
      components: [recipeComponent(a, 10, 'g')],
    });
    const loopedA = { ...a, components: [recipeComponent(b, 10, 'g')] };

    expect(() => recipeCost(loopedA, recipeBook([loopedA, b]))).toThrowError(RecipeError);
  });

  it('lets a sub-recipe line be per portion', () => {
    const perPlate = dish({
      id: 'perplate',
      name: 'Gravy on each plate',
      portions: 4,
      outputQty: 4,
      components: [recipeComponent(gravy(), 60, 'g', { scope: 'portion' })],
    });

    const cost = recipeCost(perPlate, recipeBook([gravy(), perPlate]));
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.batch).toBe(0);
    expect(cost.portionAdd).toBeCloseTo(60 * (114.56076555023924 / 2500), 10);
  });

  it('lets the operator override a sub-recipe rate', () => {
    const overridden = dish({
      id: 'ov',
      name: 'Bought-in parotta',
      portions: 2,
      family: 'count',
      outputQty: 2,
      outputUnit: 'pcs',
      components: [recipeComponent(parotta(), 4, 'pcs', { ratePerUnit: 6.85, rateUnit: 'pcs' })],
    });

    const cost = recipeCost(overridden, recipeBook([parotta(), overridden]));
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.batch).toBeCloseTo(27.4, 10); // 4 x 6.85, not 4 x 4.9433
  });
});

describe('a floor propagates up through the levels', () => {
  const unpricedGravy = (): Recipe =>
    dish({
      id: 'gravy',
      name: 'Onion Thakkali Gravy',
      portions: null,
      outputQty: 2500,
      outputUnit: 'kg',
      components: [
        ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 1500, 'g'),
        // No rate on file, three levels below the plate.
        ingredientComponent(pack('Kuruma masala, house', 1, 'kg', null), 60, 'g'),
      ],
    });

  const brokenBook = () => recipeBook([unpricedGravy(), parotta(), kuruma(), plate()]);

  it('makes the whole plate a floor', () => {
    const cost = recipeCost(plate(), brokenBook());
    expect(cost.kind).toBe('floor');
    expect(isComplete(cost)).toBe(false);
  });

  it('names the missing line and the path it was reached through', () => {
    const cost = recipeCost(plate(), brokenBook());
    if (cost.kind !== 'floor') expect.unreachable('the gravy has no rate');

    expect(cost.unpriced).toHaveLength(1);
    expect(cost.unpriced[0]?.name).toBe('Kuruma masala, house');
    expect(cost.unpriced[0]?.via).toEqual(['Chicken Kuruma', 'Onion Thakkali Gravy']);
  });

  it('never reports a floor under the field names a cost uses', () => {
    const cost = recipeCost(plate(), brokenBook());
    expect('batch' in cost).toBe(false);
    expect('perPortion' in cost).toBe(false);
    expect('costPerBase' in cost).toBe(false);
  });

  it('stops propagating when the operator prices the line by hand', () => {
    // A spend typed on the sub-recipe line settles it without a rate below.
    const handPriced = dish({
      id: 'plate',
      name: 'Parotta Kuruma Plate',
      portions: 6,
      family: 'count',
      outputQty: 6,
      outputUnit: 'pcs',
      components: [
        recipeComponent(parotta(), 8, 'pcs'),
        recipeComponent(kuruma(), 480, 'g', { spend: 61.5 }),
        ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 12, 'g', { scope: 'portion' }),
      ],
    });

    const cost = recipeCost(
      handPriced,
      recipeBook([unpricedGravy(), parotta(), kuruma(), handPriced]),
    );
    if (!isComplete(cost)) expect.unreachable('the operator priced the kuruma line');

    expect(cost.batch).toBeCloseTo(8 * (118.64 / 24) + 61.5, 9);
  });
});

describe('output quantity', () => {
  it('is what cost per base unit divides by', () => {
    const cost = recipeCost(gravy(), kitchen());
    if (!isComplete(cost)) expect.unreachable('all priced');
    expect(cost.costPerBase).toBeCloseTo(cost.total / 2500, 12);
  });

  it('is never inferred from the inputs', () => {
    // TRD 6.3: the reference workbook infers it and gets it wrong three ways.
    // Output is entered by the operator; cooking loss is theirs to know.
    const cost = recipeCost(
      dish({
        name: 'Reduced sauce',
        portions: null,
        outputQty: 600, // 1 kg of inputs cooked down to 600 g
        components: [ingredientComponent(pack('Tomato', 1, 'kg', 30, 100), 1000, 'g')],
      }),
      new Map(),
    );
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.total).toBeCloseTo(30, 10);
    expect(cost.costPerBase).toBeCloseTo(0.05, 10); // 30 / 600, not 30 / 1000
  });

  it('is refused when it yields nothing', () => {
    for (const outputQty of [0, -1, Number.NaN]) {
      expect(() =>
        recipeCost(dish({ name: 'Nothing', portions: 1, outputQty, components: [] })),
      ).toThrowError(RecipeError);
    }
  });
});

describe('a sub-recipe with no portions', () => {
  it('costs a batch without offering a per-portion figure', () => {
    const cost = recipeCost(gravy(), kitchen());
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.portions).toBeNull();
    expect(cost.perPortion).toBeNull();
    expect(cost.total).toBeCloseTo(114.5607655502, 9);
  });

  it('refuses a per-portion line, which would have nothing to apply to', () => {
    try {
      recipeCost(
        dish({
          name: 'Never plated',
          portions: null,
          components: [
            ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 4, 'g', {
              scope: 'portion',
            }),
          ],
        }),
      );
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RecipeError).code).toBe('portion_scope_without_portions');
    }
  });
});

describe('the acceptance check for build step 5 still holds', () => {
  it('matches the ghee-per-portion dish by hand', () => {
    const cost = recipeCost(gheeDosa('portion'));
    if (!isComplete(cost)) expect.unreachable('every line is priced');

    expect(cost.batch).toBeCloseTo(740.64, 10);
    expect(cost.portionAdd).toBeCloseTo(2.48, 10);
    expect(cost.perPortion).toBeCloseTo(8.40512, 10);
    expect(cost.total).toBeCloseTo(1050.64, 8);
  });

  it('is wrong by the price of the ghee if everything is divided by portions', () => {
    const right = recipeCost(gheeDosa('portion'));
    const wrong = recipeCost(gheeDosa('batch'));
    if (!isComplete(right) || !isComplete(wrong)) expect.unreachable('all priced');

    expect(wrong.perPortion).toBeCloseTo(5.94496, 10);
    expect((right.perPortion ?? 0) - (wrong.perPortion ?? 0)).toBeCloseTo(2.46016, 10);
  });

  it('adds a lot line to the cost without touching yield or quantity', () => {
    const base = gheeDosa('portion');
    const cost = recipeCost({
      ...base,
      components: [...base.components, flatComponent('Blending', 50)],
    });
    if (!isComplete(cost)) expect.unreachable('every line is priced');

    expect(cost.batch).toBeCloseTo(790.64, 10);
    expect(cost.perPortion).toBeCloseTo(8.80512, 10);

    const lot = cost.lines.find((l) => l.name === 'Blending');
    expect(lot?.kind).toBe('flat');
    expect(lot?.qty).toBe(0);
    expect(lot?.ratePerBaseUnit).toBeNull();
  });

  it('defaults every line to the batch pool', () => {
    const cost = recipeCost(filterCoffee());
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.portionAdd).toBe(0);
    expect(cost.batch).toBeCloseTo(152.18, 10);
    expect(cost.perPortion).toBeCloseTo(15.218, 10);
  });

  it('lets a flat line be per-portion, which is how packaging lands', () => {
    const boxed = dish({
      name: 'Delivery box',
      portions: 4,
      components: [
        ingredientComponent(pack('Biryani rice', 1, 'kg', 129.6, 100), 1000, 'g'),
        flatComponent('Packaging', 0.35, 'portion'),
      ],
    });

    const cost = recipeCost(boxed);
    if (!isComplete(cost)) expect.unreachable('all priced');
    expect(cost.perPortion).toBeCloseTo(32.75, 10);
  });
});

describe('rate or spend, either direction', () => {
  it('derives the rate from a spend the operator typed', () => {
    const cost = recipeCost(
      dish({
        name: 'Spend entered',
        portions: 1,
        components: [
          ingredientComponent(pack('Refined oil', 15, 'l', 2220, 100), 0.6, 'l', { spend: 3.76 }),
        ],
      }),
    );
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.batch).toBe(3.76);
    expect(cost.lines[0]?.ratePerBaseUnit).toBeCloseTo(3.76 / 600, 12);
    expect(cost.lines[0]?.entryMode).toBe('spend');
  });

  it('derives the rate at full precision rather than rounding it first', () => {
    const cost = recipeCost(
      dish({
        name: 'Precision',
        portions: 1,
        components: [
          ingredientComponent(pack('Coriander leaves', 1, 'kg', 280, 70), 15, 'g', { spend: 6.97 }),
        ],
      }),
    );
    if (!isComplete(cost)) expect.unreachable('all priced');

    expect(cost.lines[0]?.ratePerBaseUnit).toBeCloseTo(0.46466666666, 10);
    expect(cost.lines[0]?.ratePerBaseUnit).not.toBe(0.46);
  });

  it('remembers which figure the operator typed', () => {
    const shelf = pack('Ghee, Aavin', 1, 'kg', 620, 100);
    const lines = recipeCost(
      dish({
        name: 'Three ways',
        portions: 1,
        components: [
          ingredientComponent(shelf, 10, 'g'),
          ingredientComponent(shelf, 10, 'g', { ratePerUnit: 640, rateUnit: 'kg' }),
          ingredientComponent(shelf, 10, 'g', { spend: 6.0 }),
        ],
      }),
    ).lines;

    expect(lines.map((l) => l.entryMode)).toEqual(['ingredient_rate', 'rate', 'spend']);
  });

  it('lets a line entered as a spend cost even when the shelf has no rate', () => {
    const cost = recipeCost(
      dish({
        name: 'Priced by hand',
        portions: 1,
        components: [
          ingredientComponent(pack('Milagai podi, house', 1, 'kg', null), 8, 'g', { spend: 3.56 }),
        ],
      }),
    );
    if (!isComplete(cost)) expect.unreachable('the operator priced the line');
    expect(cost.batch).toBe(3.56);
  });

  it('refuses a rate and a spend on the same line', () => {
    expect(() =>
      ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 10, 'g', {
        ratePerUnit: 640,
        rateUnit: 'kg',
        spend: 6.4,
      }),
    ).toThrowError(RecipeError);
  });
});

describe('yield, and when it does and does not apply', () => {
  it('applies to a rate the operator typed', () => {
    const cost = recipeCost(
      dish({
        name: 'Typed rate',
        portions: 1,
        components: [
          ingredientComponent(pack('Onion, big', 1, 'kg', 35, 88), 200, 'g', {
            ratePerUnit: 40,
            rateUnit: 'kg',
          }),
        ],
      }),
    );
    if (!isComplete(cost)) expect.unreachable('all priced');
    expect(cost.batch).toBeCloseTo(9.090909090909, 10);
  });

  it('does not apply to a spend, which already contains it', () => {
    const cost = recipeCost(
      dish({
        name: 'Typed spend',
        portions: 1,
        components: [
          ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 200, 'g', { spend: 9.09 }),
        ],
      }),
    );
    if (!isComplete(cost)) expect.unreachable('all priced');
    expect(cost.batch).toBe(9.09);
  });

  it('does not apply to a flat line at all', () => {
    const cost = recipeCost(
      dish({ name: 'Charge only', portions: 2, components: [flatComponent('Blending', 50)] }),
    );
    if (!isComplete(cost)) expect.unreachable('a flat line always has an amount');
    expect(cost.batch).toBe(50);
    expect(cost.perPortion).toBe(25);
  });

  it('does not apply again to a sub-recipe, whose yields are already inside it', () => {
    const book = kitchen();
    const k = recipeCost(kuruma(), book);
    const cost = recipeCost(plate(), book);
    if (!isComplete(k) || !isComplete(cost)) expect.unreachable('all priced');

    const line = cost.lines.find((l) => l.name === 'Chicken Kuruma');
    expect(line?.ratePerBaseUnit).toBe(k.costPerBase);
  });
});

describe('a missing rate produces a floor, not a cost', () => {
  const withUnpriced = (): Recipe =>
    dish({
      name: 'Ghee Podi Idly Fry',
      portions: 4,
      components: [
        ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 15, 'g'),
        ingredientComponent(pack('Milagai podi, house', 1, 'kg', null), 8, 'g'),
        ingredientComponent(pack('Curry leaves', 1, 'kg', 335, 100), 4, 'g'),
      ],
    });

  it('reports a floor and names the lines that caused it', () => {
    const cost = recipeCost(withUnpriced());
    if (cost.kind !== 'floor') expect.unreachable('one line has no rate');

    expect(cost.batchFloor).toBeCloseTo(10.64, 10);
    expect(cost.perPortionFloor).toBeCloseTo(2.66, 10);
    expect(cost.unpriced.map((u) => u.name)).toEqual(['Milagai podi, house']);
    expect(cost.unpriced[0]?.via).toEqual([]);
  });

  it('leaves the unpriced line blank rather than zero', () => {
    const podi = recipeCost(withUnpriced()).lines.find((l) => l.name === 'Milagai podi, house');
    expect(podi?.cost).toBeNull();
    expect(podi?.cost).not.toBe(0);
  });

  it('treats a free ingredient as costed, not as missing', () => {
    const cost = recipeCost(
      dish({
        name: 'Kuruma base',
        portions: 4,
        components: [
          ingredientComponent(pack('Water', 1, 'l', 0, 100), 500, 'ml'),
          ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 10, 'g'),
        ],
      }),
    );
    if (!isComplete(cost)) expect.unreachable('water is priced at zero');
    expect(cost.batch).toBeCloseTo(6.2, 10);
  });
});

describe('assumptions travel up from the ingredients', () => {
  const noYield = () =>
    ingredientFromPack({
      name: 'Ghee, Aavin',
      family: 'mass',
      packQty: 1,
      packUnit: 'kg',
      packPrice: 620,
    });

  it('reports an assumed yield against the recipe that used it', () => {
    const cost = recipeCost(
      dish({
        name: 'Ghee drizzle',
        portions: 2,
        components: [ingredientComponent(noYield(), 20, 'g')],
      }),
    );

    expect(cost.assumed).toHaveLength(1);
    expect(cost.assumed[0]?.field).toBe('yieldPercent');
  });

  it('travels up from a sub-recipe too', () => {
    const child = dish({
      id: 'child',
      name: 'Ghee base',
      portions: null,
      outputQty: 100,
      components: [ingredientComponent(noYield(), 20, 'g')],
    });
    const parent = dish({
      id: 'parent',
      name: 'Uses the base',
      portions: 2,
      outputQty: 200,
      components: [recipeComponent(child, 50, 'g')],
    });

    const cost = recipeCost(parent, recipeBook([child, parent]));
    expect(cost.assumed).toHaveLength(1);
  });

  it('claims nothing when the operator entered every figure', () => {
    expect(recipeCost(filterCoffee()).assumed).toHaveLength(0);
    expect(recipeCost(plate(), kitchen()).assumed).toHaveLength(0);
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
      ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 200, 'ml');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RecipeError).code).toBe('family_mismatch');
      expect((error as RecipeError).message).toContain('density');
    }
  });

  it('refuses a negative flat charge', () => {
    expect(() => flatComponent('Rebate', -10)).toThrowError(RecipeError);
  });

  it('refuses a line with no quantity', () => {
    expect(() =>
      recipeCost(
        dish({
          name: 'Broken',
          portions: 2,
          components: [
            { ...ingredientComponent(pack('Sugar', 1, 'kg', 45.8, 100), 1, 'g'), qty: 0 },
          ],
        }),
      ),
    ).toThrowError(RecipeError);
  });
});

describe('an empty recipe', () => {
  it('costs nothing and is complete, because nothing is missing', () => {
    const cost = recipeCost(dish({ name: 'New dish', portions: 4, components: [] }));
    if (!isComplete(cost)) expect.unreachable('no lines means nothing unpriced');
    expect(cost.batch).toBe(0);
    expect(cost.total).toBe(0);
    expect(cost.costPerBase).toBe(0);
  });
});

describe('regression — the rate unit is stated, never assumed', () => {
  // Found twice while building step 5, from opposite directions. Converting a
  // per-display-unit rate into a per-base-unit rate DIVIDES by the factor;
  // converting back MULTIPLIES.
  const onion = pack('Onion, big', 1, 'kg', 35, 100);

  const batchOf = (options: Parameters<typeof ingredientComponent>[3]): number => {
    const cost = recipeCost(
      dish({ name: 'Rate unit', portions: 1, components: [ingredientComponent(onion, 200, 'g', options)] }),
    );
    if (!isComplete(cost)) expect.unreachable('priced');
    return cost.batch;
  };

  it('reads 40 per kg on a gram line as 0.04 per gram', () => {
    expect(batchOf({ ratePerUnit: 40, rateUnit: 'kg' })).toBeCloseTo(8, 10);
  });

  it('reads 0.04 per gram on a gram line the same way', () => {
    expect(batchOf({ ratePerUnit: 0.04, rateUnit: 'g' })).toBeCloseTo(8, 10);
    expect(batchOf({ ratePerUnit: 0.04 })).toBeCloseTo(8, 10);
  });

  it('is not off by the unit factor in either direction', () => {
    const perKg = batchOf({ ratePerUnit: 40, rateUnit: 'kg' });
    expect(perKg).not.toBeCloseTo(8000, 0);
    expect(perKg).not.toBeCloseTo(0.008, 6);
  });

  it('refuses a rate unit from another family', () => {
    expect(() =>
      ingredientComponent(onion, 200, 'g', { ratePerUnit: 40, rateUnit: 'l' }),
    ).toThrowError(RecipeError);
  });
});

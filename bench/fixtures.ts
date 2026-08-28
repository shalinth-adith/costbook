/**
 * Fixture dishes for the bench. Hand-costed figures live in the tests; this
 * file exists so the bench renders something real rather than something
 * plausible.
 *
 * Every rate here is typed as an operator would type it. Nothing is looked up.
 */

import { type Ingredient, ingredientFromPack } from '../core/ingredient.js';
import {
  type Recipe,
  flatComponent,
  ingredientComponent,
} from '../core/recipe.js';

function pack(
  name: string,
  packQty: number,
  packUnit: string,
  packPrice: number | null,
  yieldPercent?: number,
): Ingredient {
  const family =
    packUnit === 'l' || packUnit === 'ml' ? 'volume' : packUnit === 'pcs' ? 'count' : 'mass';
  return ingredientFromPack(
    yieldPercent === undefined
      ? { name, family, packQty, packUnit, packPrice }
      : { name, family, packQty, packUnit, packPrice, yieldPercent },
  );
}

export const shelf: readonly Ingredient[] = [
  pack('Onion, big', 50, 'kg', 2000, 88),
  pack('Coriander leaves', 1, 'kg', 280, 70),
  pack('Coconut, grated', 1, 'kg', 190, 62),
  pack('Ghee, Aavin', 1, 'kg', 620, 100),
  pack('Refined oil', 15, 'l', 2220, 100),
  pack('Water', 1, 'l', 0, 100),
  pack('Milagai podi, house', 1, 'kg', null),
  pack('Dosa rice', 1, 'kg', 60, 100),
  pack('Urad dal', 1, 'kg', 120, 100),
  pack('Coffee powder', 1, 'kg', 480, 100),
];

export const dishes: readonly Recipe[] = [
  {
    name: 'Filter Coffee',
    portions: 10,
    components: [
      ingredientComponent(pack('Coffee powder', 1, 'kg', 480, 100), 120, 'g'),
      ingredientComponent(pack('Milk, toned', 1, 'l', 60, 100), 1500, 'ml'),
      ingredientComponent(pack('Sugar', 50, 'kg', 2290, 100), 100, 'g'),
    ],
  },
  {
    name: 'Ghee Roast Dosa',
    portions: 125,
    components: [
      ingredientComponent(pack('Dosa rice', 1, 'kg', 60, 100), 8000, 'g'),
      ingredientComponent(pack('Urad dal', 1, 'kg', 120, 100), 2000, 'g'),
      ingredientComponent(pack('Fenugreek', 1, 'kg', 180, 100), 100, 'g'),
      ingredientComponent(pack('Salt, iodised', 1, 'kg', 22, 100), 120, 'g'),
      // The line the whole per-portion pool exists for: drizzled on each dosa.
      ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 4, 'g', { scope: 'portion' }),
      flatComponent('Blending', 50),
    ],
  },
  {
    name: 'Onion salad cup',
    portions: 4,
    components: [
      ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 200, 'g'),
      ingredientComponent(pack('Coriander leaves', 1, 'kg', 280, 70), 20, 'g'),
      ingredientComponent(pack('Lemon', 1, 'pcs', 1.2, 100), 4, 'pcs'),
    ],
  },
  {
    name: 'Kuruma base',
    portions: 4,
    components: [
      // Water carries a quantity and costs nothing. Not the same as unknown.
      ingredientComponent(pack('Water', 1, 'l', 0, 100), 500, 'ml'),
      ingredientComponent(pack('Coconut, grated', 1, 'kg', 190, 62), 40, 'g'),
      // Entered as a spend: "0.6 litres of oil, and that cost 3.76".
      ingredientComponent(pack('Refined oil', 15, 'l', 2220, 100), 0.6, 'l', { spend: 3.76 }),
    ],
  },
  {
    name: 'Ghee Podi Idly Fry',
    portions: 4,
    components: [
      ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 15, 'g'),
      // No rate on file. This dish reports a floor, not a cost.
      ingredientComponent(pack('Milagai podi, house', 1, 'kg', null), 8, 'g'),
      ingredientComponent(pack('Curry leaves', 1, 'kg', 335, 100), 4, 'g'),
      // Yield left blank, so 100% is assumed and flagged as ours.
      ingredientComponent(pack('Chutney cup, 30 ml', 1, 'pcs', 1.1), 1, 'pcs', {
        scope: 'portion',
      }),
    ],
  },
];

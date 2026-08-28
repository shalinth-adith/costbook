/**
 * Fixture dishes for the bench. Hand-costed figures live in the tests; this
 * file exists so the bench renders something real rather than something
 * plausible.
 *
 * Every rate here is typed as an operator would type it. Nothing is looked up.
 */

import { type Ingredient, ingredientFromPack } from '../core/ingredient';
import {
  type Recipe,
  type RecipeBook,
  flatComponent,
  ingredientComponent,
  recipeBook,
  recipeComponent,
} from '../core/recipe';
import type { UnitFamily } from '../core/units';

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

export const shelf: readonly Ingredient[] = [
  pack('Onion, big', 50, 'kg', 2000, 88),
  pack('Coriander leaves', 1, 'kg', 280, 70),
  pack('Coconut, grated', 1, 'kg', 190, 62),
  pack('Ghee, Aavin', 1, 'kg', 620, 100),
  pack('Refined oil', 15, 'l', 2220, 100),
  pack('Water', 1, 'l', 0, 100),
  pack('Milagai podi, house', 1, 'kg', null),
];

/* The three-level plate. Gravy sits inside kuruma, kuruma inside the plate. */

const gravy: Recipe = {
  id: 'gravy',
  name: 'Onion Thakkali Gravy',
  family: 'mass',
  outputQty: 2500,
  outputUnit: 'kg',
  portions: null,
  components: [
    ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 1500, 'g'),
    ingredientComponent(pack('Tomato', 1, 'kg', 30, 95), 1000, 'g'),
    ingredientComponent(pack('Refined oil', 1, 'l', 148, 100), 100, 'ml'),
  ],
};

const parotta: Recipe = {
  id: 'parotta',
  name: 'Veechu Parotta',
  family: 'count',
  outputQty: 24,
  outputUnit: 'pcs',
  portions: null,
  components: [
    ingredientComponent(pack('Maida', 1, 'kg', 48, 100), 2000, 'g'),
    ingredientComponent(pack('Refined oil', 1, 'l', 148, 100), 150, 'ml'),
    ingredientComponent(pack('Salt, iodised', 1, 'kg', 22, 100), 20, 'g'),
  ],
};

const kuruma: Recipe = {
  id: 'kuruma',
  name: 'Chicken Kuruma',
  family: 'mass',
  outputQty: 4000,
  outputUnit: 'kg',
  portions: null,
  components: [
    ingredientComponent(pack('Chicken, dressed', 1, 'kg', 220, 100), 2000, 'g'),
    recipeComponent(gravy, 240, 'g'),
    ingredientComponent(pack('Coconut, grated', 1, 'kg', 190, 62), 200, 'g'),
  ],
};

const plate: Recipe = {
  id: 'plate',
  name: 'Parotta Kuruma Plate',
  family: 'count',
  outputQty: 6,
  outputUnit: 'pcs',
  portions: 6,
  components: [
    recipeComponent(parotta, 8, 'pcs'),
    recipeComponent(kuruma, 480, 'g'),
    ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 12, 'g', { scope: 'portion' }),
  ],
};

const filterCoffee: Recipe = {
  id: 'coffee',
  name: 'Filter Coffee',
  family: 'volume',
  outputQty: 2000,
  outputUnit: 'l',
  portions: 10,
  components: [
    ingredientComponent(pack('Coffee powder', 1, 'kg', 480, 100), 120, 'g'),
    ingredientComponent(pack('Milk, toned', 1, 'l', 60, 100), 1500, 'ml'),
    ingredientComponent(pack('Sugar', 50, 'kg', 2290, 100), 100, 'g'),
  ],
};

const gheeDosa: Recipe = {
  id: 'dosa',
  name: 'Ghee Roast Dosa',
  family: 'mass',
  outputQty: 10000,
  outputUnit: 'kg',
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
};

const podiIdly: Recipe = {
  id: 'podi',
  name: 'Ghee Podi Idly Fry',
  family: 'count',
  outputQty: 4,
  outputUnit: 'pcs',
  portions: 4,
  components: [
    ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 15, 'g'),
    // No rate on file. This dish reports a floor, not a cost.
    ingredientComponent(pack('Milagai podi, house', 1, 'kg', null), 8, 'g'),
    // Entered as a spend: "0.6 litres of oil, and that cost 3.76".
    ingredientComponent(pack('Refined oil', 15, 'l', 2220, 100), 0.6, 'l', { spend: 3.76 }),
    // Yield left blank, so 100% is assumed and flagged as ours.
    ingredientComponent(pack('Chutney cup, 30 ml', 1, 'pcs', 1.1), 1, 'pcs', { scope: 'portion' }),
  ],
};

/** A plate whose gravy, three levels down, is missing a rate. */
const brokenGravy: Recipe = {
  ...gravy,
  id: 'broken-gravy',
  components: [
    ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 1500, 'g'),
    ingredientComponent(pack('Kuruma masala, house', 1, 'kg', null), 60, 'g'),
  ],
};
const brokenKuruma: Recipe = {
  ...kuruma,
  id: 'broken-kuruma',
  components: [
    ingredientComponent(pack('Chicken, dressed', 1, 'kg', 220, 100), 2000, 'g'),
    recipeComponent(brokenGravy, 240, 'g'),
  ],
};
const brokenPlate: Recipe = {
  ...plate,
  id: 'broken-plate',
  name: 'Parotta Kuruma Plate (rate missing three levels down)',
  components: [recipeComponent(parotta, 8, 'pcs'), recipeComponent(brokenKuruma, 480, 'g')],
};

export const book: RecipeBook = recipeBook([
  gravy,
  parotta,
  kuruma,
  plate,
  filterCoffee,
  gheeDosa,
  podiIdly,
  brokenGravy,
  brokenKuruma,
  brokenPlate,
]);

/** Rendered in this order: the nested plate first, since it is the point. */
export const dishes: readonly Recipe[] = [
  plate,
  kuruma,
  gravy,
  parotta,
  gheeDosa,
  filterCoffee,
  podiIdly,
  brokenPlate,
];

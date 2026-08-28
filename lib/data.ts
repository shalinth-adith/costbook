/**
 * The kitchen the screens render, until the database arrives at build step 12.
 *
 * Every rate is typed the way an operator types it. Nothing here is looked up
 * or defaulted — a rate we do not have is null, and stays null all the way to
 * the screen.
 */

import { type Ingredient, ingredientFromPack } from '@/core/ingredient';
import {
  type Recipe,
  type RecipeBook,
  ingredientComponent,
  recipeBook,
  recipeComponent,
} from '@/core/recipe';
import type { UnitFamily } from '@/core/units';

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

/** Fields the screens show that the costing engine has no opinion about. */
export interface DishMeta {
  readonly category: string;
  readonly station: string | null;
  /** Prints on the prep card. Not used in the costing. */
  readonly portionSize: string | null;
  readonly sellingPrice: number | null;
  readonly note: string;
  readonly onMenu: boolean;
}

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
    ingredientComponent(pack('Onion, big', 1, 'kg', 40, 88), 200, 'g'),
    ingredientComponent(pack('Coriander leaves', 1, 'kg', 280, 70), 20, 'g'),
    ingredientComponent(pack('Lemon', 1, 'pcs', 1.2, 100), 4, 'pcs'),
    ingredientComponent(pack('Banana leaf liner', 1, 'pcs', 2.5, 100), 4, 'pcs'),
    // Drizzled on each plate rather than mixed into the batch. The line the
    // per-portion pool exists for.
    ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 12, 'g', { scope: 'portion' }),
    ingredientComponent(pack('Chutney cup, 30 ml', 1, 'pcs', 1.1, 100), 1, 'pcs', {
      scope: 'portion',
    }),
  ],
};

/** The same screen, on a dish that is not finished. One rate is missing. */
const podiIdly: Recipe = {
  id: 'podi-idly',
  name: 'Ghee Podi Idly Fry',
  family: 'count',
  outputQty: 4,
  outputUnit: 'pcs',
  portions: 4,
  components: [
    recipeComponent(
      {
        id: 'mini-idly',
        name: 'Mini Idly, steamed',
        family: 'count',
        outputQty: 60,
        outputUnit: 'pcs',
        portions: null,
        components: [
          ingredientComponent(pack('Idly rice', 1, 'kg', 52, 100), 3000, 'g'),
          ingredientComponent(pack('Urad dal', 1, 'kg', 120, 100), 750, 'g'),
        ],
      },
      12,
      'pcs',
    ),
    ingredientComponent(pack('Ghee, Aavin', 1, 'kg', 620, 100), 15, 'g'),
    // No rate on file. This dish reports a floor, and no price is offered.
    ingredientComponent(pack('Milagai podi, house', 1, 'kg', null), 8, 'g'),
    ingredientComponent(pack('Curry leaves', 1, 'kg', 335, 100), 4, 'g'),
    ingredientComponent(pack('Chutney cup, 30 ml', 1, 'pcs', 1.1), 1, 'pcs', { scope: 'portion' }),
  ],
};

const miniIdly: Recipe = {
  id: 'mini-idly',
  name: 'Mini Idly, steamed',
  family: 'count',
  outputQty: 60,
  outputUnit: 'pcs',
  portions: null,
  components: [
    ingredientComponent(pack('Idly rice', 1, 'kg', 52, 100), 3000, 'g'),
    ingredientComponent(pack('Urad dal', 1, 'kg', 120, 100), 750, 'g'),
  ],
};

export const book: RecipeBook = recipeBook([
  gravy,
  parotta,
  kuruma,
  plate,
  miniIdly,
  podiIdly,
]);

export const meta: Readonly<Record<string, DishMeta>> = {
  plate: {
    category: 'Mains',
    station: 'Parotta counter',
    portionSize: '420 g',
    sellingPrice: 119,
    note: 'Saved two minutes ago. Every rate on this dish is on file, so the figure above is a cost, not a floor.',
    onMenu: true,
  },
  'podi-idly': {
    category: 'Breakfast',
    station: 'Tawa',
    portionSize: '280 g',
    sellingPrice: null,
    note: 'One line has no rate, so the figure above is a floor and not a cost.',
    onMenu: false,
  },
};

/** Dishes that appear in the recipe list. Sub-recipes are reachable, not listed. */
export const dishIds: readonly string[] = ['plate', 'podi-idly'];

export const ORG = {
  name: 'Sri Krishna Café',
  currencySymbol: '₹',
  currencyCode: 'INR',
  /** Asked at setup, never assumed. COSTING_MODELS 3. */
  foodCostTarget: 32,
} as const;

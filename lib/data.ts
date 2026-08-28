/**
 * The kitchen the screens render, until the database arrives at build step 12.
 *
 * Every rate is typed the way an operator types it. Nothing here is looked up
 * or defaulted — a rate we do not have is null, and stays null all the way to
 * the screen.
 */

import { type Ingredient, ingredientFromPack } from '@/core/ingredient';
import {
  type Pantry,
  type Recipe,
  type RecipeBook,
  ingredientComponent,
  pantryOf,
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

/**
 * Every ingredient the kitchen buys, defined once.
 *
 * Before this existed the same onion appeared six times, each with its own
 * rate, and editing one would have left the other five at the old price
 * silently. A component line now points here.
 */
const SHELF: readonly Ingredient[] = [
  pack('Onion, big', 50, 'kg', 2000, 88),
  pack('Tomato', 1, 'kg', 30, 95),
  pack('Coriander leaves', 1, 'kg', 280, 70),
  pack('Mint leaves', 1, 'kg', 240, 70),
  pack('Curry leaves', 1, 'kg', 335, 100),
  pack('Green chilli', 1, 'kg', 180, 95),
  pack('Coconut, grated', 1, 'kg', 190, 62),
  pack('Cashew, whole', 1, 'kg', 980, 100),
  pack('Ghee, Aavin', 1, 'kg', 620, 100),
  pack('Refined oil', 15, 'l', 2220, 100),
  pack('Curd, set', 1, 'kg', 72, 100),
  pack('Ginger garlic paste', 1, 'kg', 220, 100),
  pack('Fried onion, birista', 1, 'kg', 410, 100),
  pack('Salt, iodised', 1, 'kg', 22, 100),
  pack('Lemon', 1, 'pcs', 1.2, 100),
  pack('Banana leaf liner', 1, 'pcs', 2.5, 100),
  pack('Chutney cup, 30 ml', 1, 'pcs', 1.1, 100),
  pack('Water', 1, 'l', 0, 100),
  pack('Maida', 1, 'kg', 48, 100),
  pack('Chicken, dressed', 1, 'kg', 220, 100),
  pack('Mutton, curry cut', 1, 'kg', 780, 100),
  pack('Seeraga samba rice', 25, 'kg', 3240, 100),
  pack('Idly rice', 1, 'kg', 52, 100),
  pack('Dosa rice', 1, 'kg', 60, 100),
  pack('Urad dal', 1, 'kg', 120, 100),
  pack('Fenugreek', 1, 'kg', 180, 100),
  pack('Coffee powder', 1, 'kg', 480, 100),
  pack('Milk, toned', 1, 'l', 60, 100),
  pack('Sugar', 50, 'kg', 2290, 100),
  pack('Rose syrup', 750, 'ml', 180, 100),
  // No rate on file. Any dish using it reports a floor until one is entered.
  pack('Milagai podi, house', 1, 'kg', null),
  pack('Nannari syrup', 1, 'l', null),
];

const BY_NAME: ReadonlyMap<string, Ingredient> = new Map(SHELF.map((i) => [i.name, i]));

/** Look an ingredient up by the name a recipe writes. */
function ing(name: string): Ingredient {
  const found = BY_NAME.get(name);
  if (found === undefined) throw new Error(`No ingredient on the shelf called "${name}"`);
  return found;
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
    ingredientComponent(ing('Onion, big'), 1500, 'g'),
    ingredientComponent(ing('Tomato'), 1000, 'g'),
    ingredientComponent(ing('Refined oil'), 100, 'ml'),
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
    ingredientComponent(ing('Maida'), 2000, 'g'),
    ingredientComponent(ing('Refined oil'), 150, 'ml'),
    ingredientComponent(ing('Salt, iodised'), 20, 'g'),
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
    ingredientComponent(ing('Chicken, dressed'), 2000, 'g'),
    recipeComponent(gravy, 240, 'g'),
    ingredientComponent(ing('Coconut, grated'), 200, 'g'),
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
    ingredientComponent(ing('Onion, big'), 200, 'g'),
    ingredientComponent(ing('Coriander leaves'), 20, 'g'),
    ingredientComponent(ing('Lemon'), 4, 'pcs'),
    ingredientComponent(ing('Banana leaf liner'), 4, 'pcs'),
    // Drizzled on each plate rather than mixed into the batch. The line the
    // per-portion pool exists for.
    ingredientComponent(ing('Ghee, Aavin'), 12, 'g', { scope: 'portion' }),
    ingredientComponent(ing('Chutney cup, 30 ml'), 1, 'pcs', {
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
          ingredientComponent(ing('Idly rice'), 3000, 'g'),
          ingredientComponent(ing('Urad dal'), 750, 'g'),
        ],
      },
      12,
      'pcs',
    ),
    ingredientComponent(ing('Ghee, Aavin'), 15, 'g'),
    // No rate on file. This dish reports a floor, and no price is offered.
    ingredientComponent(ing('Milagai podi, house'), 8, 'g'),
    ingredientComponent(ing('Curry leaves'), 4, 'g'),
    ingredientComponent(ing('Chutney cup, 30 ml'), 1, 'pcs', { scope: 'portion' }),
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
    ingredientComponent(ing('Idly rice'), 3000, 'g'),
    ingredientComponent(ing('Urad dal'), 750, 'g'),
  ],
};

/** Everything the "add a component" search can reach. */

/* ── the rest of the menu ─────────────────────────────────────────────
 * Enough dishes for the dashboard to be worth reading: some comfortably
 * under target, some near it, some over, and two with a rate missing.
 * Every rate below is one an operator typed.
 */

const biryani: Recipe = {
  id: 'mutton-biryani',
  name: 'Mutton Seeraga Samba Biryani',
  family: 'mass', outputQty: 4800, outputUnit: 'kg', portions: 4,
  components: [
    ingredientComponent(ing('Mutton, curry cut'), 800, 'g'),
    ingredientComponent(ing('Seeraga samba rice'), 1000, 'g'),
    ingredientComponent(ing('Curd, set'), 300, 'g'),
    ingredientComponent(ing('Onion, big'), 600, 'g'),
    ingredientComponent(ing('Ghee, Aavin'), 80, 'g'),
    ingredientComponent(ing('Ginger garlic paste'), 60, 'g'),
    ingredientComponent(ing('Banana leaf liner'), 1, 'pcs', { scope: 'portion' }),
  ],
};

const chicken65: Recipe = {
  id: 'chicken-65',
  name: 'Chicken 65',
  family: 'mass', outputQty: 900, outputUnit: 'kg', portions: 3,
  components: [
    ingredientComponent(ing('Chicken, dressed'), 700, 'g'),
    ingredientComponent(ing('Curd, set'), 80, 'g'),
    ingredientComponent(ing('Refined oil'), 120, 'ml'),
    ingredientComponent(ing('Curry leaves'), 8, 'g'),
    ingredientComponent(ing('Green chilli'), 20, 'g'),
  ],
};

const kothuParotta: Recipe = {
  id: 'kothu-parotta',
  name: 'Mutton Kothu Parotta',
  family: 'mass', outputQty: 1600, outputUnit: 'kg', portions: 2,
  components: [
    recipeComponent(parotta, 4, 'pcs'),
    ingredientComponent(ing('Mutton, curry cut'), 250, 'g'),
    ingredientComponent(ing('Onion, big'), 200, 'g'),
    ingredientComponent(ing('Refined oil'), 40, 'ml'),
  ],
};

const filterCoffee: Recipe = {
  id: 'filter-coffee',
  name: 'Filter Coffee',
  family: 'volume', outputQty: 2000, outputUnit: 'l', portions: 10,
  components: [
    ingredientComponent(ing('Coffee powder'), 120, 'g'),
    ingredientComponent(ing('Milk, toned'), 1500, 'ml'),
    ingredientComponent(ing('Sugar'), 100, 'g'),
  ],
};

const jigarthanda: Recipe = {
  id: 'jigarthanda',
  name: 'Jigarthanda',
  family: 'volume', outputQty: 1200, outputUnit: 'l', portions: 4,
  components: [
    ingredientComponent(ing('Milk, toned'), 900, 'ml'),
    ingredientComponent(ing('Sugar'), 120, 'g'),
    ingredientComponent(ing('Cashew, whole'), 20, 'g'),
    // No rate on file. This dish reports a floor.
    ingredientComponent(ing('Nannari syrup'), 60, 'ml'),
  ],
};

const sambarVada: Recipe = {
  id: 'sambar-vada',
  name: 'Sambar Vada (2 pc)',
  family: 'count', outputQty: 10, outputUnit: 'pcs', portions: 5,
  components: [
    ingredientComponent(ing('Urad dal'), 400, 'g'),
    ingredientComponent(ing('Refined oil'), 200, 'ml'),
    ingredientComponent(ing('Onion, big'), 100, 'g'),
    ingredientComponent(ing('Curry leaves'), 10, 'g'),
  ],
};

const mysoreBonda: Recipe = {
  id: 'mysore-bonda',
  name: 'Mysore Bonda (3 pc)',
  family: 'count', outputQty: 18, outputUnit: 'pcs', portions: 6,
  components: [
    ingredientComponent(ing('Maida'), 500, 'g'),
    ingredientComponent(ing('Curd, set'), 150, 'g'),
    ingredientComponent(ing('Refined oil'), 250, 'ml'),
    ingredientComponent(ing('Green chilli'), 15, 'g'),
  ],
};

const roseMilk: Recipe = {
  id: 'rose-milk',
  name: 'Rose Milk',
  family: 'volume', outputQty: 1000, outputUnit: 'l', portions: 4,
  components: [
    ingredientComponent(ing('Milk, toned'), 800, 'ml'),
    ingredientComponent(ing('Sugar'), 90, 'g'),
    ingredientComponent(ing('Rose syrup'), 80, 'ml'),
  ],
};

export const shelf: readonly Ingredient[] = SHELF;

export const recipes: readonly Recipe[] = [
  gravy, parotta, kuruma, miniIdly,
  plate, podiIdly, biryani, chicken65, kothuParotta,
  filterCoffee, jigarthanda, sambarVada, mysoreBonda, roseMilk,
];

export const book: RecipeBook = recipeBook(recipes);

/** Everything a costing needs: the recipes it may nest and the ingredients its lines point at. */
export const pantry: Pantry = pantryOf(recipes, SHELF);

function dishMeta(
  category: string,
  station: string | null,
  portionSize: string | null,
  sellingPrice: number | null,
  onMenu: boolean,
  note: string,
): DishMeta {
  return { category, station, portionSize, sellingPrice, note, onMenu };
}

const MADE_NOTE =
  'A batch you make, used inside other dishes. It carries its own cost and yield across.';

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
    sellingPrice: 89,
    note: 'One line has no rate, so the figure above is a floor and not a cost.',
    onMenu: false,
  },

  'mutton-biryani': dishMeta('Biryani', 'Dum counter', '520 g', 289, true, 'On the menu.'),
  'chicken-65': dishMeta('Starters', 'Fry counter', '260 g', 189, true, 'On the menu.'),
  'kothu-parotta': dishMeta('Mains', 'Parotta counter', '380 g', 219, true, 'On the menu.'),
  'filter-coffee': dishMeta('Beverages', 'Coffee counter', '150 ml', 45, true, 'On the menu.'),
  jigarthanda: dishMeta('Beverages', 'Coffee counter', '300 ml', 89, false, 'One line has no rate, so the figure above is a floor and not a cost.'),
  'sambar-vada': dishMeta('Breakfast', 'Fry counter', '220 g', 59, true, 'On the menu.'),
  'mysore-bonda': dishMeta('Snacks', 'Fry counter', '180 g', 49, true, 'On the menu.'),
  'rose-milk': dishMeta('Beverages', 'Coffee counter', '250 ml', 59, true, 'On the menu.'),

  // Made in the kitchen and used inside other dishes. No menu price of its own.
  gravy: dishMeta('Made in house', 'Gravy station', null, null, false, MADE_NOTE),
  parotta: dishMeta('Made in house', 'Parotta counter', null, null, false, MADE_NOTE),
  kuruma: dishMeta('Made in house', 'Gravy station', null, null, false, MADE_NOTE),
  'mini-idly': dishMeta('Made in house', 'Steam counter', null, null, false, MADE_NOTE),
};

/** Dishes that appear in the recipe list. Sub-recipes are reachable, not listed. */
export const dishIds: readonly string[] = recipes.map((r) => r.id);

export const ORG = {
  name: 'Sri Krishna Café',
  currencySymbol: '₹',
  currencyCode: 'INR',
  /** Asked at setup, never assumed. COSTING_MODELS 3. */
  foodCostTarget: 32,
} as const;


/**
 * How many recipes use a given ingredient or sub-recipe, by name. The question
 * an owner asks before changing a rate: what else does this move?
 */
export function usedInCount(name: string): number {
  let count = 0;
  for (const recipe of recipes) {
    const hit = recipe.components.some((c) =>
      c.kind === 'ingredient'
        ? (BY_NAME.get(name)?.id ?? '') === c.ingredientId
        : c.kind === 'recipe'
          ? (book.get(c.childId)?.name ?? '') === name
          : false,
    );
    if (hit) count += 1;
  }
  return count;
}

/**
 * The two kinds of thing that can go on a component line.
 *
 *   ingredient  something you buy. A pack, a supplier, a rate.
 *   dish        something you make. Gravy, parotta, kuruma, a plate — food,
 *               whether or not it is sold on its own today.
 *
 * Costing treats them identically once each one's cost per base unit is known,
 * which is the whole of the nesting rule. They are still not the same thing to
 * the person cooking: one arrives from a supplier and the other is made in the
 * kitchen, and the picker must not merge them into one list.
 *
 * Nesting a dish inside another dish is ordinary here, not an exception. A
 * parotta goes on a plate; both are food.
 */
export type ComponentKind = 'ingredient' | 'dish';

export const KIND_LABEL: Readonly<Record<ComponentKind, string>> = {
  ingredient: 'Ingredients',
  dish: 'Your dishes',
};

export const KIND_HINT: Readonly<Record<ComponentKind, string>> = {
  ingredient: 'Things you buy. Each one has a pack size and a rate you entered.',
  dish: 'Things you make. Each carries its own cost and yield across into this one.',
};

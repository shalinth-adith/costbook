import { describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";
import type { Pantry, Recipe } from "@/core/recipe";

import { MAX_DEPTH, breakdown, totals } from "./breakdown";

/**
 * The owner's own example, costed as a kitchen would enter it.
 *
 * Filter coffee is the shortest dish that needs every rule at once: a
 * decoction made in a pot and poured by the cup, milk and sugar added at the
 * cup, and a card that has to say which of those goes where. If the
 * arithmetic is wrong the cook is sent to the shelf for the wrong amount,
 * which is the one failure a prep card exists to prevent.
 */

const ing = (id: string, name: string): Ingredient =>
  ({
    id,
    name,
    family: "mass",
    packQty: 1000,
    packPrice: 100,
    yieldPercent: 100,
  }) as unknown as Ingredient;

/** A decoction: one batch is 1000 ml, from 100 g of powder and 900 ml water. */
const DECOCTION: Recipe = {
  id: "r-dec",
  name: "Decoction",
  family: "volume",
  outputQty: 1000,
  outputUnit: "ml",
  portions: null,
  components: [
    {
      kind: "ingredient",
      scope: "batch",
      ingredientId: "i-pow",
      qty: 100,
      unit: "g",
      entry: { mode: "ingredient_rate" },
    },
    {
      kind: "ingredient",
      scope: "batch",
      ingredientId: "i-wat",
      qty: 900,
      unit: "ml",
      entry: { mode: "ingredient_rate" },
    },
  ],
} as unknown as Recipe;

/**
 * Filter coffee: a batch of 10 cups. 300 ml of decoction for the batch, and
 * per cup 120 ml milk and 8 g sugar.
 */
const COFFEE: Recipe = {
  id: "r-cof",
  name: "Filter Coffee",
  family: "volume",
  outputQty: 1500,
  outputUnit: "ml",
  portions: 10,
  components: [
    {
      kind: "recipe",
      scope: "batch",
      childId: "r-dec",
      qty: 300,
      unit: "ml",
      entry: { mode: "ingredient_rate" },
    },
    {
      kind: "ingredient",
      scope: "portion",
      ingredientId: "i-mlk",
      qty: 120,
      unit: "ml",
      entry: { mode: "ingredient_rate" },
    },
    {
      kind: "ingredient",
      scope: "portion",
      ingredientId: "i-sug",
      qty: 8,
      unit: "g",
      entry: { mode: "ingredient_rate" },
    },
  ],
} as unknown as Recipe;

const PANTRY: Pantry = {
  recipes: new Map([
    ["r-dec", DECOCTION],
    ["r-cof", COFFEE],
  ]),
  ingredients: new Map([
    ["i-pow", ing("i-pow", "Coffee powder")],
    ["i-wat", ing("i-wat", "Water")],
    ["i-mlk", ing("i-mlk", "Milk")],
    ["i-sug", ing("i-sug", "Sugar")],
  ]),
};

describe("a dish, all the way down", () => {
  const lines = breakdown(COFFEE, PANTRY);

  it("prints the sub-recipe as a heading and its parts underneath", () => {
    expect(lines.map((l) => [l.name, l.depth, l.kind])).toEqual([
      ["Decoction", 0, "recipe"],
      ["Coffee powder", 1, "ingredient"],
      ["Water", 1, "ingredient"],
      ["Milk", 0, "ingredient"],
      ["Sugar", 0, "ingredient"],
    ]);
  });

  it("scales what is inside the sub-recipe by how much of it is used", () => {
    // 300 of the decoction's 1000 ml batch is three tenths of it, so three
    // tenths of its powder and its water — not the whole pot.
    const powder = lines.find((l) => l.name === "Coffee powder");
    const water = lines.find((l) => l.name === "Water");
    expect(powder?.qty).toBeCloseTo(30, 6);
    expect(water?.qty).toBeCloseTo(270, 6);
  });

  it("carries a per-plate line once for every plate the batch makes", () => {
    // The failure this prevents: a card that printed 120 ml against a batch
    // of ten sends a cook for a tenth of the milk they need.
    expect(lines.find((l) => l.name === "Milk")?.qty).toBeCloseTo(1200, 6);
    expect(lines.find((l) => l.name === "Sugar")?.qty).toBeCloseTo(80, 6);
  });

  it("names the pot each line goes into", () => {
    expect(lines.find((l) => l.name === "Water")?.via).toEqual(["Decoction"]);
    expect(lines.find((l) => l.name === "Milk")?.via).toEqual([]);
  });
});

describe("what it refuses to do", () => {
  it("does not follow a sub-recipe that is already open above it", () => {
    // The engine refuses a cycle before this ever runs. This is the second
    // belt: a row that got in another way must not recurse for ever.
    const a: Recipe = {
      id: "a",
      name: "A",
      family: "mass",
      outputQty: 100,
      outputUnit: "g",
      portions: null,
      components: [
        {
          kind: "recipe",
          scope: "batch",
          childId: "b",
          qty: 10,
          unit: "g",
          entry: { mode: "ingredient_rate" },
        },
      ],
    } as unknown as Recipe;
    const b: Recipe = {
      id: "b",
      name: "B",
      family: "mass",
      outputQty: 100,
      outputUnit: "g",
      portions: null,
      components: [
        {
          kind: "recipe",
          scope: "batch",
          childId: "a",
          qty: 10,
          unit: "g",
          entry: { mode: "ingredient_rate" },
        },
      ],
    } as unknown as Recipe;
    const p: Pantry = {
      recipes: new Map([
        ["a", a],
        ["b", b],
      ]),
      ingredients: new Map(),
    };

    const lines = breakdown(a, p);
    expect(lines.map((l) => l.name)).toEqual(["B", "A"]);
    expect(lines[1]?.note).toBe("already open above this line");
  });

  it("says so when a sub-recipe has left the book", () => {
    const orphan: Recipe = {
      id: "o",
      name: "Orphan",
      family: "mass",
      outputQty: 100,
      outputUnit: "g",
      portions: null,
      components: [
        {
          kind: "recipe",
          scope: "batch",
          childId: "gone",
          qty: 10,
          unit: "g",
          entry: { mode: "ingredient_rate" },
        },
      ],
    } as unknown as Recipe;
    const lines = breakdown(orphan, {
      recipes: new Map(),
      ingredients: new Map(),
    });
    expect(lines[0]?.note).toBe("not in the book");
    // Named, not dropped: a line that vanishes from a card is a line a cook
    // never learns was missing.
    expect(lines).toHaveLength(1);
  });

  it("stops at the depth a sheet of A4 can hold", () => {
    // A chain longer than MAX_DEPTH: the last one is named and not opened.
    const chain: Recipe[] = [];
    for (let i = 0; i <= MAX_DEPTH + 1; i += 1) {
      chain.push({
        id: `n${String(i)}`,
        name: `N${String(i)}`,
        family: "mass",
        outputQty: 100,
        outputUnit: "g",
        portions: null,
        components:
          i === MAX_DEPTH + 1
            ? []
            : [
                {
                  kind: "recipe",
                  scope: "batch",
                  childId: `n${String(i + 1)}`,
                  qty: 100,
                  unit: "g",
                  entry: { mode: "ingredient_rate" },
                },
              ],
      } as unknown as Recipe);
    }
    const p: Pantry = {
      recipes: new Map(chain.map((r) => [r.id, r])),
      ingredients: new Map(),
    };
    const lines = breakdown(chain[0] as Recipe, p);
    expect(lines.at(-1)?.note).toContain(
      `nested deeper than ${String(MAX_DEPTH)}`,
    );
  });

  it("does not divide by a batch that yields nothing", () => {
    const bad: Recipe = {
      id: "z",
      name: "Z",
      family: "mass",
      outputQty: 0,
      outputUnit: "g",
      portions: null,
      components: [
        {
          kind: "ingredient",
          scope: "batch",
          ingredientId: "i-pow",
          qty: 5,
          unit: "g",
          entry: { mode: "ingredient_rate" },
        },
      ],
    } as unknown as Recipe;
    const top: Recipe = {
      id: "t",
      name: "T",
      family: "mass",
      outputQty: 100,
      outputUnit: "g",
      portions: null,
      components: [
        {
          kind: "recipe",
          scope: "batch",
          childId: "z",
          qty: 10,
          unit: "g",
          entry: { mode: "ingredient_rate" },
        },
      ],
    } as unknown as Recipe;
    const p: Pantry = {
      recipes: new Map([
        ["z", bad],
        ["t", top],
      ]),
      ingredients: PANTRY.ingredients,
    };
    const lines = breakdown(top, p);
    expect(lines.map((l) => l.name)).toEqual(["Z"]);
    expect(lines.every((l) => Number.isFinite(l.qty))).toBe(true);
  });
});

describe("the shopping list", () => {
  it("adds one ingredient up wherever in the tree it appears", () => {
    const list = totals(breakdown(COFFEE, PANTRY));
    expect(list.map((t) => t.name)).toEqual([
      "Coffee powder",
      "Milk",
      "Sugar",
      "Water",
    ]);
    expect(list.find((t) => t.name === "Water")?.qty).toBeCloseTo(270, 6);
  });

  it("keeps the sub-recipe headings out of it", () => {
    // The decoction is not a thing anybody buys — its parts are.
    expect(
      totals(breakdown(COFFEE, PANTRY)).some((t) => t.name === "Decoction"),
    ).toBe(false);
  });

  it("leaves two units of one ingredient as two rows rather than one wrong one", () => {
    const odd: Recipe = {
      id: "q",
      name: "Q",
      family: "mass",
      outputQty: 100,
      outputUnit: "g",
      portions: null,
      components: [
        {
          kind: "ingredient",
          scope: "batch",
          ingredientId: "i-pow",
          qty: 5,
          unit: "g",
          entry: { mode: "ingredient_rate" },
        },
        {
          kind: "ingredient",
          scope: "batch",
          ingredientId: "i-pow",
          qty: 1,
          unit: "kg",
          entry: { mode: "ingredient_rate" },
        },
      ],
    } as unknown as Recipe;
    const list = totals(breakdown(odd, PANTRY));
    expect(list).toHaveLength(2);
  });
});

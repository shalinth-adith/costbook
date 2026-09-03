/**
 * What to do today.
 *
 * An owner following this list acts on the order, so the order is the thing
 * under test. A loss before a thin margin; the ingredient in thirty dishes
 * before the one in one; a figure eight times the median flagged and one
 * three times it left alone.
 */

import { describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe, RecipeComponent } from "@/core/recipe";

import type { CostingModel } from "./costing";
import type { DashboardRow } from "./dashboard";
import { todo } from "./todo";

const MODEL: CostingModel = {
  foodCostTarget: 30,
  wastagePercent: 0,
  packagingPerPortion: 0,
  rounding: "none",
};

const row = (
  name: string,
  cost: number | null,
  price: number | null,
  fc: number | null,
  gap: DashboardRow["gap"] = "none",
): DashboardRow =>
  ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    category: "Tiffin",
    costPerPortion: cost,
    sellingPrice: price,
    foodCostPercent: fc,
    status: "on",
    delta: null,
    gap,
    nestedCount: 0,
    barBase: 0,
    barOver: 0,
  }) as DashboardRow;

const ing = (id: string, price: number | null): Ingredient =>
  ({
    id,
    name: id,
    family: "mass",
    purchaseQty: 1000,
    purchasePrice: price,
    purchaseUnit: "kg",
    yieldPercent: 100,
    yieldIsAssumed: false,
  }) as Ingredient;

const line = (id: string): RecipeComponent => ({
  kind: "ingredient",
  scope: "batch",
  ingredientId: id,
  qty: 100,
  unit: "g",
  entry: { mode: "ingredient_rate" },
});

const recipe = (id: string, ids: readonly string[]): Recipe =>
  ({
    id,
    name: id,
    family: "count",
    outputQty: 4,
    outputUnit: "pc",
    portions: 4,
    components: ids.map(line),
  }) as Recipe;

const base = {
  rows: [] as DashboardRow[],
  recipes: [] as Recipe[],
  ingredients: [] as Ingredient[],
  history: {},
  model: MODEL,
  staleAfterDays: 90,
  today: "2026-09-03",
};

describe("raising a price", () => {
  it("names the price that hits the target", () => {
    // Koottu costs 0.77 and sells at 2.29, keeping 66 against 70 planned.
    // At a 30% target the price that fixes it is 0.77 / 0.30 = 2.5667.
    const [a] = todo({ ...base, rows: [row("Koottu", 0.77, 2.29, 33.6)] });
    expect(a?.kind).toBe("raise_price");
    if (a?.kind !== "raise_price") return;
    expect(a.from).toBe(2.29);
    // "none" means no lattice, not no rounding: a price is still stated to
    // the fils. 0.77 / 0.30 = 2.5667, said as 2.57.
    expect(a.to).toBe(2.57);
    expect(a.keepsAfter).toBeCloseTo(70, 0);
    expect(a.losing).toBe(false);
  });

  it("puts a loss ahead of a thin margin", () => {
    // Every plate of the loss is money out of the door. It goes first even
    // though the thin dish sorted earlier alphabetically.
    const list = todo({
      ...base,
      rows: [row("Aloo", 0.77, 2.29, 33.6), row("Mispriced", 5, 2, 250)],
    });
    expect(list[0]?.kind).toBe("raise_price");
    if (list[0]?.kind !== "raise_price") return;
    expect(list[0].row.name).toBe("Mispriced");
    expect(list[0].losing).toBe(true);
  });

  it("says nothing about a dish already earning what was planned", () => {
    expect(todo({ ...base, rows: [row("Idly", 0.21, 0.96, 22)] })).toEqual([]);
  });

  it("never asks about a dish nobody has costed", () => {
    // suggestPrice on a floor is advice to lose money. The unpriced pile
    // stays out of this list entirely.
    const list = todo({
      ...base,
      rows: [row("No rate", null, 4, null, "no_rate")],
    });
    expect(list.some((a) => a.kind === "raise_price")).toBe(false);
  });
});

describe("pricing an ingredient", () => {
  it("asks for the one holding up the most dishes first", () => {
    const list = todo({
      ...base,
      rows: [],
      recipes: [
        recipe("a", ["ghee", "salt"]),
        recipe("b", ["ghee"]),
        recipe("c", ["ghee"]),
      ],
      ingredients: [ing("salt", null), ing("ghee", null)],
    });
    expect(list[0]?.kind).toBe("price_ingredient");
    if (list[0]?.kind !== "price_ingredient") return;
    expect(list[0].ingredient.id).toBe("ghee");
    expect(list[0].usedIn).toBe(3);
  });

  it("leaves out an unpriced ingredient nothing uses", () => {
    // It holds up nothing. Asking about it is asking about the wrong thing.
    const list = todo({ ...base, ingredients: [ing("orphan", null)] });
    expect(list).toEqual([]);
  });

  it("does not ask about an ingredient that already has a rate", () => {
    const list = todo({
      ...base,
      recipes: [recipe("a", ["ghee"])],
      ingredients: [ing("ghee", 500)],
    });
    expect(list.some((a) => a.kind === "price_ingredient")).toBe(false);
  });
});

describe("a figure that cannot be right", () => {
  const menu = [
    row("Idly", 0.5, 2, 25),
    row("Dosa", 0.6, 2.4, 25),
    row("Vada", 0.4, 1.6, 25),
    row("Pongal", 0.55, 2.2, 25),
  ];

  it("flags a cost per portion many times the menu's median", () => {
    /*
     * Butter cookies on the live book: 1,729 a portion on a menu whose middle
     * dish costs half a dirham. A batch of cookies costed as one cookie. It
     * passes every validation — a positive number in a numeric field.
     */
    const list = todo({
      ...base,
      rows: [...menu, row("Butter cookies", 1729, 5, 25)],
    });
    const flag = list.find((a) => a.kind === "check_portions");
    expect(flag).toBeDefined();
    if (flag?.kind !== "check_portions") return;
    expect(flag.row.name).toBe("Butter cookies");
    expect(flag.times).toBeGreaterThan(1000);
  });

  it("leaves an expensive dish alone", () => {
    // A biryani at three times the median is a biryani. Eight is the line.
    const list = todo({
      ...base,
      rows: [...menu, row("Biryani", 1.6, 6.4, 25)],
    });
    expect(list.some((a) => a.kind === "check_portions")).toBe(false);
  });
});

describe("a rate gone stale", () => {
  it("asks about the most-used one first", () => {
    const list = todo({
      ...base,
      recipes: [recipe("a", ["ghee", "hing"]), recipe("b", ["ghee"])],
      ingredients: [ing("hing", 100), ing("ghee", 500)],
      history: {
        hing: [
          {
            from: null,
            to: 100,
            qty: 1000,
            on: "2026-01-01",
            source: "manual",
          },
        ],
        ghee: [
          {
            from: null,
            to: 500,
            qty: 1000,
            on: "2026-02-01",
            source: "manual",
          },
        ],
      },
    });
    expect(list[0]?.kind).toBe("refresh_rate");
    if (list[0]?.kind !== "refresh_rate") return;
    // Ghee is fresher but in more dishes. Usage wins.
    expect(list[0].ingredient.id).toBe("ghee");
    expect(list[0].usedIn).toBe(2);
  });

  it("does not nag about a rate inside the threshold", () => {
    const list = todo({
      ...base,
      recipes: [recipe("a", ["ghee"])],
      ingredients: [ing("ghee", 500)],
      history: {
        ghee: [
          {
            from: null,
            to: 500,
            qty: 1000,
            on: "2026-08-20",
            source: "manual",
          },
        ],
      },
    });
    expect(list).toEqual([]);
  });
});

describe("the list as a whole", () => {
  it("keeps the order: losses, thin, unpriced, outliers, stale", () => {
    const list = todo({
      ...base,
      rows: [
        row("Idly", 0.5, 2, 25),
        row("Dosa", 0.6, 2.4, 25),
        row("Thin", 0.77, 2.29, 33.6),
        row("Loss", 5, 2, 250),
        row("Typo", 900, 5000, 18),
      ],
      recipes: [recipe("a", ["ghee"]), recipe("b", ["hing"])],
      ingredients: [ing("ghee", null), ing("hing", 100)],
      history: {
        hing: [
          {
            from: null,
            to: 100,
            qty: 1000,
            on: "2026-01-01",
            source: "manual",
          },
        ],
      },
    });
    expect(list.map((a) => a.kind)).toEqual([
      "raise_price",
      "raise_price",
      "price_ingredient",
      "check_portions",
      "refresh_rate",
    ]);
  });

  it("stops at six, because a list of sixty is a backlog", () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row(`T${String(i)}`, 0.77, 2.29, 33.6),
    );
    expect(todo({ ...base, rows })).toHaveLength(6);
  });

  it("is empty when there is nothing to do, which is the answer you want", () => {
    expect(todo({ ...base, rows: [row("Idly", 0.21, 0.96, 22)] })).toEqual([]);
  });
});

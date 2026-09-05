/**
 * What to do today.
 *
 * An owner following this list acts on the order, so the order is the thing
 * under test. A loss before a thin margin; the ingredients as one job, led by
 * the one in the most dishes; a figure eight times the median flagged and one
 * three times it left alone; a rate a thousand times its neighbours caught.
 */

import { DEFAULT_MODEL } from '@/lib/costing';
import { describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe, RecipeComponent } from "@/core/recipe";

import type { CostingModel } from "./costing";
import type { DashboardRow } from "./dashboard";
import { todo } from "./todo";

const MODEL: CostingModel = {
  ...DEFAULT_MODEL,
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

// `pricedAt` is what ages a rate, on this list and on the Ingredients screen
// alike. It used to be read from the newest history row here and from the
// ingredient there, so one screen called a rate stale while the other called
// it fresh.
const ing = (
  id: string,
  price: number | null,
  qty = 1000,
  pricedAt?: string,
): Ingredient =>
  ({
    id,
    name: id,
    family: "mass",
    purchaseQty: qty,
    purchasePrice: price,
    purchaseUnit: "kg",
    yieldPercent: 100,
    yieldIsAssumed: false,
    ...(pricedAt === undefined ? {} : { pricedAt }),
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
    const { actions } = todo({ ...base, rows: [row("Koottu", 0.77, 2.29, 33.6)] });
    const [a] = actions;
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
    const { actions } = todo({
      ...base,
      rows: [row("Aloo", 0.77, 2.29, 33.6), row("Mispriced", 5, 2, 250)],
    });
    expect(actions[0]?.kind).toBe("raise_price");
    if (actions[0]?.kind !== "raise_price") return;
    expect(actions[0].row.name).toBe("Mispriced");
    expect(actions[0].losing).toBe(true);
  });

  it("says nothing about a dish already earning what was planned", () => {
    expect(todo({ ...base, rows: [row("Idly", 0.21, 0.96, 22)] }).actions).toEqual([]);
  });

  it("never asks about a dish nobody has costed", () => {
    const { actions } = todo({ ...base, rows: [row("No rate", null, 4, null, "no_rate")] });
    expect(actions.some((a) => a.kind === "raise_price")).toBe(false);
  });
});

describe("pricing the ingredients", () => {
  it("is one job, led by the ingredient holding up the most dishes", () => {
    const { actions } = todo({
      ...base,
      recipes: [recipe("a", ["ghee", "salt"]), recipe("b", ["ghee"]), recipe("c", ["ghee"])],
      ingredients: [ing("salt", null), ing("ghee", null)],
    });
    expect(actions.filter((a) => a.kind === "price_ingredients")).toHaveLength(1);
    const a = actions[0];
    if (a?.kind !== "price_ingredients") return;
    expect(a.count).toBe(2);
    expect(a.first.id).toBe("ghee");
    expect(a.firstUsedIn).toBe(3);
  });

  it("says water is probably free rather than asking for its price", () => {
    const { actions } = todo({
      ...base,
      recipes: [recipe("a", ["water", "ghee"])],
      ingredients: [ing("water", null), ing("ghee", null)],
    });
    const a = actions[0];
    if (a?.kind !== "price_ingredients") return;
    expect(a.probablyFree).toEqual(["water"]);
    expect(a.first.id).toBe("ghee");
  });

  it("leaves out an unpriced ingredient nothing uses", () => {
    expect(todo({ ...base, ingredients: [ing("orphan", null)] }).actions).toEqual([]);
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
    const { actions } = todo({ ...base, rows: [...menu, row("Butter cookies", 1729, 5000, 25)] });
    const flag = actions.find((a) => a.kind === "check_portions");
    expect(flag).toBeDefined();
    if (flag?.kind !== "check_portions") return;
    expect(flag.row.name).toBe("Butter cookies");
    expect(flag.times).toBeGreaterThan(1000);
  });

  it("leaves an expensive dish alone", () => {
    const { actions } = todo({ ...base, rows: [...menu, row("Biryani", 1.6, 6.4, 25)] });
    expect(actions.some((a) => a.kind === "check_portions")).toBe(false);
  });

  it("flags a rate a thousand times its neighbours", () => {
    const { actions } = todo({
      ...base,
      recipes: [recipe("a", ["maida", "rice", "dal", "salt"])],
      ingredients: [ing("rice", 3), ing("dal", 8), ing("salt", 1), ing("maida", 1800)],
    });
    const flag = actions.find((a) => a.kind === "check_rate");
    expect(flag).toBeDefined();
    if (flag?.kind !== "check_rate") return;
    expect(flag.ingredient.id).toBe("maida");
    expect(flag.times).toBeGreaterThan(100);
  });

  it("leaves saffron alone", () => {
    const { actions } = todo({
      ...base,
      recipes: [recipe("a", ["saffron", "rice", "dal", "salt"])],
      ingredients: [ing("rice", 3), ing("dal", 8), ing("salt", 1), ing("saffron", 100)],
    });
    expect(actions.some((a) => a.kind === "check_rate")).toBe(false);
  });
});

describe("a rate gone stale", () => {
  it("asks about the most-used one first", () => {
    const { actions } = todo({
      ...base,
      recipes: [recipe("a", ["ghee", "hing"]), recipe("b", ["ghee"])],
      ingredients: [
        ing("hing", 100, 1000, "2026-01-01"),
        ing("ghee", 500, 1000, "2026-02-01"),
      ],
    });
    expect(actions[0]?.kind).toBe("refresh_rate");
    if (actions[0]?.kind !== "refresh_rate") return;
    expect(actions[0].ingredient.id).toBe("ghee");
  });

  it("does not nag about a rate inside the threshold", () => {
    const { actions } = todo({
      ...base,
      recipes: [recipe("a", ["ghee"])],
      ingredients: [ing("ghee", 500, 1000, "2026-08-20")],
    });
    expect(actions).toEqual([]);
  });
});

describe("the list as a whole", () => {
  it("keeps the order: losses, thin, ingredients, outliers, stale", () => {
    const { actions } = todo({
      ...base,
      rows: [
        row("Idly", 0.5, 2, 25),
        row("Dosa", 0.6, 2.4, 25),
        row("Thin", 0.77, 2.29, 33.6),
        row("Loss", 5, 2, 250),
        row("Typo", 900, 5000, 18),
      ],
      recipes: [recipe("a", ["ghee"]), recipe("b", ["hing"])],
      ingredients: [ing("ghee", null), ing("hing", 100, 1000, "2026-01-01")],
    });
    expect(actions.map((a) => a.kind)).toEqual([
      "raise_price",
      "raise_price",
      "price_ingredients",
      "check_portions",
      "refresh_rate",
    ]);
  });

  it("caps the list at six but reports the true total", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`T${String(i)}`, 0.77, 2.29, 33.6));
    const t = todo({ ...base, rows });
    expect(t.actions).toHaveLength(6);
    expect(t.total).toBe(20);
  });

  it("is empty when there is nothing to do, which is the answer you want", () => {
    const t = todo({ ...base, rows: [row("Idly", 0.21, 0.96, 22)] });
    expect(t.actions).toEqual([]);
    expect(t.total).toBe(0);
  });
});

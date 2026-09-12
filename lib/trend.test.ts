import { describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe, RecipeComponent } from "@/core/recipe";

import { DEFAULT_MODEL } from "./costing";
import type { DishMeta } from "./data";
import type { RateChange } from "./org";
import { trendOf } from "./trend";

/**
 * Six months of plate cost from the rate history. The month card's
 * arithmetic run six times; what is new is which dishes get counted, and a
 * wrong answer there is a plausible chart with the wrong slope.
 */
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
const line = (id: string): RecipeComponent =>
  ({
    kind: "ingredient",
    scope: "batch",
    ingredientId: id,
    qty: 1000,
    unit: "g",
    entry: { mode: "ingredient_rate" },
  }) as RecipeComponent;
const dish = (id: string, ids: readonly string[]): Recipe =>
  ({
    id,
    name: id,
    family: "count",
    outputQty: 1,
    outputUnit: "pc",
    portions: 1,
    components: ids.map(line),
  }) as Recipe;
const meta = (ids: readonly string[]): Record<string, DishMeta> =>
  Object.fromEntries(
    ids.map((id) => [
      id,
      {
        category: "Mains",
        station: null,
        portionSize: null,
        sellingPrice: 100,
        note: "",
        onMenu: true,
      },
    ]),
  );
const change = (from: number | null, to: number, on: string): RateChange =>
  ({ from, to, qty: 1000, on, source: "manual" }) as RateChange;

describe("plate costs, month by month", () => {
  it("walks the months oldest to newest, ending on the one asked for", () => {
    const out = trendOf({
      recipes: [dish("a", ["rice"])],
      ingredients: [ing("rice", 40)],
      meta: meta(["a"]),
      model: DEFAULT_MODEL,
      history: {},
      period: "2026-08",
      until: "2026-08",
      months: 3,
    } as never);
    expect(out.months.map((m) => m.period)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("shows the rise where the rise happened, and flat either side", () => {
    // Rice 30 → 40 in July. June reads 30, July and August read 40.
    const out = trendOf({
      recipes: [dish("a", ["rice"])],
      ingredients: [ing("rice", 40)],
      meta: meta(["a"]),
      model: DEFAULT_MODEL,
      history: { rice: [change(30, 40, "2026-07-12")] },
      until: "2026-08",
      months: 3,
    });
    expect(out.months.map((m) => m.total)).toEqual([30, 40, 40]);
    expect(out.percent).toBeCloseTo(33.33, 1);
  });

  it("says flat as null rather than as nought per cent", () => {
    const out = trendOf({
      recipes: [dish("a", ["rice"])],
      ingredients: [ing("rice", 40)],
      meta: meta(["a"]),
      model: DEFAULT_MODEL,
      history: {},
      until: "2026-08",
      months: 3,
    });
    expect(out.percent).toBeNull();
    expect(out.dishes).toBe(1);
  });

  it("reads a rate's arrival as flat, never as a rise from nothing", () => {
    // Ghee got its first price in August. `shelfAtEndOf` leaves a first rate
    // in place rather than rolling it back to nothing — the month card's
    // contract — so the ghee dish costs the same in every month and the
    // trend does not show a menu inflating because somebody finished costing.
    const out = trendOf({
      recipes: [dish("a", ["rice"]), dish("b", ["ghee"])],
      ingredients: [ing("rice", 40), ing("ghee", 300)],
      meta: meta(["a", "b"]),
      model: DEFAULT_MODEL,
      history: { ghee: [change(null, 300, "2026-08-02")] },
      until: "2026-08",
      months: 3,
    });
    expect(out.dishes).toBe(2);
    expect(out.months.map((m) => m.total)).toEqual([340, 340, 340]);
    expect(out.percent).toBeNull();
  });
});

describe("whether anything actually moved", () => {
  it("counts a rate that moved inside the window", () => {
    const out = trendOf({
      recipes: [dish("a", ["rice"])],
      ingredients: [ing("rice", 40)],
      meta: meta(["a"]),
      model: DEFAULT_MODEL,
      history: { rice: [change(30, 40, "2026-07-12")] },
      until: "2026-08",
      months: 3,
    });
    expect(out.moved).toBe(1);
  });

  it("does not count a first rate as a move", () => {
    /*
     * Somebody finishing their costing is not a supplier raising a price.
     * The card reads this to decide whether it has a half-year to draw or
     * only today's rates copied across six months.
     */
    const out = trendOf({
      recipes: [dish("a", ["rice"])],
      ingredients: [ing("rice", 40)],
      meta: meta(["a"]),
      model: DEFAULT_MODEL,
      history: { rice: [change(null, 40, "2026-07-12")] },
      until: "2026-08",
      months: 3,
    });
    expect(out.moved).toBe(0);
  });

  it("does not count a move that happened before the window", () => {
    const out = trendOf({
      recipes: [dish("a", ["rice"])],
      ingredients: [ing("rice", 40)],
      meta: meta(["a"]),
      model: DEFAULT_MODEL,
      history: { rice: [change(30, 40, "2026-01-09")] },
      until: "2026-08",
      months: 3,
    });
    expect(out.moved).toBe(0);
  });

  it("is nought on a book whose rates have never been touched", () => {
    const out = trendOf({
      recipes: [dish("a", ["rice"])],
      ingredients: [ing("rice", 40)],
      meta: meta(["a"]),
      model: DEFAULT_MODEL,
      history: {},
      until: "2026-08",
      months: 3,
    });
    expect(out.moved).toBe(0);
  });
});

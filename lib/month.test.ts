import { describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe, RecipeComponent } from "@/core/recipe";

import { DEFAULT_MODEL } from "./costing";
import type { DishMeta } from "./data";
import { compareMonth, monthAfter, monthBefore, shelfAtEndOf } from "./month";
import type { RateChange } from "./org";

/**
 * A month against the month before it, computed by rolling rate changes back
 * rather than by keeping snapshots. The arithmetic is the whole feature, and
 * a mistake in it would be invisible: a plausible percentage, wrong.
 */
const ing = (id: string, price: number): Ingredient =>
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

const line = (id: string, qty = 1000): RecipeComponent =>
  ({
    kind: "ingredient",
    scope: "batch",
    ingredientId: id,
    qty,
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
    components: ids.map((i) => line(i)),
  }) as Recipe;

const meta: Readonly<Record<string, DishMeta>> = {
  a: {
    category: "Mains",
    station: null,
    portionSize: null,
    sellingPrice: 100,
    note: "",
    onMenu: true,
  },
};

const change = (from: number | null, to: number, on: string): RateChange =>
  ({ from, to, qty: 1000, on, source: "manual" }) as RateChange;

describe("the month either side", () => {
  it("knows the day after a month ends, over a year boundary too", () => {
    expect(monthAfter("2026-08")).toBe("2026-09-01");
    expect(monthAfter("2026-12")).toBe("2027-01-01");
  });

  it("knows the month before, over a year boundary too", () => {
    expect(monthBefore("2026-09")).toBe("2026-08");
    expect(monthBefore("2026-01")).toBe("2025-12");
  });
});

describe("the shelf as it stood", () => {
  const history = {
    rice: [change(40, 50, "2026-09-10"), change(30, 40, "2026-08-14")],
  };

  it("undoes every change after the month, and no change inside it", () => {
    // At the end of August, rice had already moved to 40 but not yet to 50.
    const then = shelfAtEndOf("2026-08", [ing("rice", 50)], history);
    expect(then[0]?.purchasePrice).toBe(40);
  });

  it("leaves the shelf alone for a month with nothing after it", () => {
    const now = shelfAtEndOf("2026-09", [ing("rice", 50)], history);
    expect(now[0]?.purchasePrice).toBe(50);
  });

  it("does not roll back a rate's arrival, which would leave a dish uncostable", () => {
    // A first rate is not a price rise. Undoing it would report the menu as
    // having risen from nothing the month it became costable.
    const arrived = { rice: [change(null, 50, "2026-09-10")] };
    const then = shelfAtEndOf("2026-08", [ing("rice", 50)], arrived);
    expect(then[0]?.purchasePrice).toBe(50);
  });
});

describe("comparing a month", () => {
  const base = {
    recipes: [dish("a", ["rice"])],
    ingredients: [ing("rice", 50)],
    meta,
    model: DEFAULT_MODEL,
  };

  it("reports what the rates did, and which way", () => {
    // Rice went 30 to 40 during August. One kilo a dish, so the plate went
    // 30 to 40 as well: a third dearer.
    const out = compareMonth({
      ...base,
      ingredients: [ing("rice", 40)],
      history: { rice: [change(30, 40, "2026-08-14")] },
      period: "2026-08",
    });
    expect(out.against).toBe("2026-07");
    expect(out.costThen).toBeCloseTo(30, 2);
    expect(out.costNow).toBeCloseTo(40, 2);
    expect(out.percent).toBeCloseTo(33.33, 1);
    expect(out.dearer).toBe(1);
    expect(out.cheaper).toBe(0);
    expect(out.rateMoves).toBe(1);
  });

  it("reports a fall as a fall", () => {
    const out = compareMonth({
      ...base,
      ingredients: [ing("rice", 20)],
      history: { rice: [change(40, 20, "2026-08-03")] },
      period: "2026-08",
    });
    expect(out.percent).toBeLessThan(0);
    expect(out.cheaper).toBe(1);
    expect(out.dearer).toBe(0);
  });

  it("says nothing moved rather than dressing it as nought per cent", () => {
    const out = compareMonth({ ...base, history: {}, period: "2026-08" });
    expect(out.rateMoves).toBe(0);
    expect(out.percent).toBeNull();
    expect(out.impact.moved).toHaveLength(0);
  });

  it("ignores a change made after the month it is reporting", () => {
    // September's rise must not appear in August's figure.
    const out = compareMonth({
      ...base,
      ingredients: [ing("rice", 90)],
      history: {
        rice: [change(40, 90, "2026-09-11"), change(30, 40, "2026-08-14")],
      },
      period: "2026-08",
    });
    expect(out.costNow).toBeCloseTo(40, 2);
    expect(out.rateMoves).toBe(1);
  });

  it("ignores a change made before the month it is reporting", () => {
    const out = compareMonth({
      ...base,
      ingredients: [ing("rice", 40)],
      history: { rice: [change(10, 40, "2026-06-02")] },
      period: "2026-08",
    });
    expect(out.rateMoves).toBe(0);
    expect(out.percent).toBeNull();
  });

  it("counts a dish only when it was costable at both dates", () => {
    // Rice arrived in August. The dish became costable rather than dearer,
    // and counting it would report the menu as having risen from nothing.
    const out = compareMonth({
      ...base,
      history: { rice: [change(null, 50, "2026-08-09")] },
      period: "2026-08",
    });
    expect(out.percent).toBeNull();
  });
});

describe("a rate that moved and reached nothing", () => {
  const frozenLine = (id: string): RecipeComponent =>
    ({
      kind: "ingredient",
      scope: "batch",
      ingredientId: id,
      qty: 1000,
      unit: "g",
      entry: { mode: "rate", ratePerBaseUnit: 0.03 },
    }) as RecipeComponent;

  it("counts a shelf move that no line follows, rather than blaming the amounts", () => {
    // The shape a pasted sheet leaves behind: the rate lives on the line, so
    // the shelf can move all it likes and the dish costs what the sheet said.
    const out = compareMonth({
      recipes: [
        {
          id: "a",
          name: "a",
          family: "count",
          outputQty: 1,
          outputUnit: "pc",
          portions: 1,
          components: [frozenLine("rice")],
        } as Recipe,
      ],
      ingredients: [ing("rice", 40)],
      meta,
      model: DEFAULT_MODEL,
      history: { rice: [change(30, 40, "2026-08-14")] },
      period: "2026-08",
    });
    expect(out.rateMoves).toBe(1);
    expect(out.frozenByLineRates).toBe(1);
    expect(out.percent).toBeNull();
  });

  it("does not call it frozen when one line does follow the shelf", () => {
    const out = compareMonth({
      recipes: [
        dish("a", ["rice"]),
        {
          id: "b",
          name: "b",
          family: "count",
          outputQty: 1,
          outputUnit: "pc",
          portions: 1,
          components: [frozenLine("rice")],
        } as Recipe,
      ],
      ingredients: [ing("rice", 40)],
      meta,
      model: DEFAULT_MODEL,
      history: { rice: [change(30, 40, "2026-08-14")] },
      period: "2026-08",
    });
    expect(out.frozenByLineRates).toBe(0);
    expect(out.percent).not.toBeNull();
  });
});

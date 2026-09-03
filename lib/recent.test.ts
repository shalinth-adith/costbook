/**
 * What moved, and what it moved.
 *
 * Every rule here fails silently if it is wrong. A window that is a day out
 * drops a change nobody then hears about; a roll-back that restores the price
 * but not the pack size reports a rise that never happened; three changes to
 * one ingredient counted as three movers turns a five-minute screen into a
 * diary. None of them throw.
 */

import { describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";

import type { DishMeta } from "./data";
import type { CostingModel } from "./costing";
import type { RateChange } from "./org";
import { movesSince, recent, rollBack, since } from "./recent";

const TODAY = "2026-09-03";

function ing(over: Partial<Ingredient> & { id: string }): Ingredient {
  return {
    name: over.id,
    family: "mass",
    purchaseQty: 1000,
    purchasePrice: 500,
    purchaseUnit: "kg",
    yieldPercent: 100,
    yieldIsAssumed: false,
    ...over,
  } as Ingredient;
}

function change(over: Partial<RateChange> & { on: string }): RateChange {
  return { from: 500, to: 600, qty: 1000, source: "manual", ...over };
}

describe("the window", () => {
  it("includes today and reaches back the full count of days", () => {
    // Inclusive of both ends: a 30-day window ending the 3rd starts on the
    // 5th of August, not the 4th. Off by one here silently drops a day's
    // changes, and nothing ever reports that it did.
    expect(since(TODAY, 30)).toBe("2026-08-05");
    expect(since(TODAY, 1)).toBe(TODAY);
    expect(since(TODAY, 7)).toBe("2026-08-28");
  });

  it("crosses a month boundary correctly", () => {
    expect(since("2026-03-02", 5)).toBe("2026-02-26");
  });
});

describe("movesSince", () => {
  const ghee = ing({ id: "ghee", name: "Ghee" });

  it("takes a change on the first day of the window", () => {
    const moves = movesSince(
      { ghee: [change({ on: "2026-08-05" })] },
      [ghee],
      "2026-08-05",
    );
    expect(moves).toHaveLength(1);
  });

  it("leaves out a change from the day before it", () => {
    const moves = movesSince(
      { ghee: [change({ on: "2026-08-04" })] },
      [ghee],
      "2026-08-05",
    );
    expect(moves).toEqual([]);
  });

  it("reports three changes to one ingredient as one net move", () => {
    // The owner wants where ghee stands now against where it stood a month
    // ago, not its diary. From the oldest change's `from`, to the newest
    // change's `to`.
    const moves = movesSince(
      {
        ghee: [
          change({ on: "2026-08-10", from: 500, to: 540 }),
          change({ on: "2026-08-20", from: 540, to: 580 }),
          change({ on: "2026-08-30", from: 580, to: 610 }),
        ],
      },
      [ghee],
      "2026-08-05",
    );
    expect(moves).toHaveLength(1);
    expect(moves[0]?.from).toBe(500);
    expect(moves[0]?.to).toBe(610);
    expect(moves[0]?.on).toBe("2026-08-30");
  });

  it("does not depend on the order the changes arrive in", () => {
    // The book hands them back newest first; a test or a different query
    // might not. Sorting rather than trusting the caller is the difference
    // between a correct figure and one that is right by luck.
    const newestFirst = movesSince(
      {
        ghee: [
          change({ on: "2026-08-30", from: 580, to: 610 }),
          change({ on: "2026-08-10", from: 500, to: 540 }),
        ],
      },
      [ghee],
      "2026-08-05",
    );
    expect(newestFirst[0]?.from).toBe(500);
    expect(newestFirst[0]?.to).toBe(610);
  });

  it("calls a first rate a first rate, not a rise from nothing", () => {
    // `from` null means the ingredient had no rate before. A percentage
    // against null would be a rise of infinity, printed as a figure.
    const moves = movesSince(
      { ghee: [change({ on: "2026-08-10", from: null, to: 610 })] },
      [ghee],
      "2026-08-05",
    );
    expect(moves[0]?.from).toBeNull();
    expect(moves[0]?.percent).toBeNull();
  });

  it("computes the net percentage from the window's ends", () => {
    const moves = movesSince(
      { ghee: [change({ on: "2026-08-10", from: 500, to: 600 })] },
      [ghee],
      "2026-08-05",
    );
    expect(moves[0]?.percent).toBeCloseTo(20, 6);
  });

  it("sorts the biggest proportional move first", () => {
    const moves = movesSince(
      {
        ghee: [change({ on: "2026-08-10", from: 500, to: 550 })],
        rice: [change({ on: "2026-08-10", from: 100, to: 200 })],
      },
      [ghee, ing({ id: "rice", name: "Rice" })],
      "2026-08-05",
    );
    expect(moves.map((m) => m.name)).toEqual(["Rice", "Ghee"]);
  });

  it("leaves out an ingredient that no longer exists", () => {
    // A change to something since deleted is a change nobody can act on.
    // Naming it would print a row headed by a database id.
    const moves = movesSince(
      { gone: [change({ on: "2026-08-10" })] },
      [ghee],
      "2026-08-05",
    );
    expect(moves).toEqual([]);
  });

  it("is empty when nothing moved", () => {
    expect(movesSince({}, [ghee], "2026-08-05")).toEqual([]);
  });
});

describe("rollBack", () => {
  it("restores the price the window started at", () => {
    const out = rollBack(
      [ing({ id: "ghee", purchasePrice: 610 })],
      [
        {
          ingredientId: "ghee",
          name: "Ghee",
          from: 500,
          to: 610,
          qty: 1000,
          on: "2026-08-30",
          source: "manual",
          percent: 22,
        },
      ],
    );
    expect(out[0]?.purchasePrice).toBe(500);
  });

  it("restores the pack size as well as the price", () => {
    /*
     * The reason RateChange carries `qty` at all: a supplier who raises a
     * price often changes the pack at the same time. Restoring 500 against a
     * 5kg pack when the 500 was for a 1kg pack reports a fivefold fall that
     * never happened — and it is a plausible number, so nothing catches it.
     */
    const out = rollBack(
      [ing({ id: "ghee", purchasePrice: 2800, purchaseQty: 5000 })],
      [
        {
          ingredientId: "ghee",
          name: "Ghee",
          from: 500,
          to: 2800,
          qty: 1000,
          on: "2026-08-30",
          source: "manual",
          percent: 460,
        },
      ],
    );
    expect(out[0]?.purchasePrice).toBe(500);
    expect(out[0]?.purchaseQty).toBe(1000);
  });

  it("rolls a first rate back to no rate at all", () => {
    // Not to zero. Zero is reserved for things that are genuinely free.
    const out = rollBack(
      [ing({ id: "ghee", purchasePrice: 610 })],
      [
        {
          ingredientId: "ghee",
          name: "Ghee",
          from: null,
          to: 610,
          qty: 1000,
          on: "2026-08-30",
          source: "manual",
          percent: null,
        },
      ],
    );
    expect(out[0]?.purchasePrice).toBeNull();
  });

  it("leaves an ingredient that did not move exactly as it was", () => {
    const rice = ing({ id: "rice", purchasePrice: 100 });
    expect(rollBack([rice], [])[0]).toBe(rice);
  });
});

/* ── the whole thing, over a real two-ingredient dish ─────────────────── */

const MODEL: CostingModel = {
  foodCostTarget: 30,
  wastagePercent: 0,
  packagingPerPortion: 0,
  rounding: "none",
};

function dish(): Recipe {
  return {
    id: "poori",
    name: "Poori Masala",
    family: "count",
    outputQty: 10,
    outputUnit: "pc",
    portions: 10,
    components: [
      // `entry: ingredient_rate` is the line that follows its ingredient's
      // rate — which is the only kind that can move when a rate moves, and
      // therefore the only kind this module is about (TRD 6.6).
      {
        kind: "ingredient",
        scope: "batch",
        ingredientId: "ghee",
        qty: 500,
        unit: "g",
        entry: { mode: "ingredient_rate" },
      },
      {
        kind: "ingredient",
        scope: "batch",
        ingredientId: "rice",
        qty: 1000,
        unit: "g",
        entry: { mode: "ingredient_rate" },
      },
    ],
  } as Recipe;
}

const META: Record<string, DishMeta> = {
  poori: {
    category: "Tiffin",
    station: null,
    portionSize: null,
    sellingPrice: 40,
    note: "",
    onMenu: true,
    updatedAt: "2026-08-01",
  } as DishMeta,
};

describe("recent", () => {
  it("is quiet when nothing moved, which is a good week", () => {
    const out = recent({
      recipes: [dish()],
      ingredients: [ing({ id: "ghee" }), ing({ id: "rice" })],
      meta: META,
      model: MODEL,
      history: {},
      today: TODAY,
      days: 30,
    });
    expect(out.quiet).toBe(true);
    expect(out.moves).toEqual([]);
    expect(out.impact.moved).toEqual([]);
  });

  it("finds the dish a rate rise moved", () => {
    const out = recent({
      recipes: [dish()],
      ingredients: [
        ing({ id: "ghee", name: "Ghee", purchasePrice: 1000 }),
        ing({ id: "rice", name: "Rice", purchasePrice: 500 }),
      ],
      meta: META,
      model: MODEL,
      history: { ghee: [change({ on: "2026-08-20", from: 500, to: 1000 })] },
      today: TODAY,
      days: 30,
    });
    expect(out.quiet).toBe(false);
    expect(out.impact.moved.map((m) => m.name)).toEqual(["Poori Masala"]);
    // Ghee doubled on half a kilo across ten portions: the plate costs more.
    expect(out.impact.moved[0]?.costDelta).toBeGreaterThan(0);
  });

  it("attributes the movement to the rate that caused it", () => {
    const out = recent({
      recipes: [dish()],
      ingredients: [
        ing({ id: "ghee", name: "Ghee", purchasePrice: 1000 }),
        ing({ id: "rice", name: "Rice", purchasePrice: 500 }),
      ],
      meta: META,
      model: MODEL,
      history: { ghee: [change({ on: "2026-08-20", from: 500, to: 1000 })] },
      today: TODAY,
      days: 30,
    });
    expect(out.leaders).toHaveLength(1);
    expect(out.leaders[0]?.move.name).toBe("Ghee");
    expect(out.leaders[0]?.dishesMoved).toBe(1);
  });

  it("ignores a change that fell outside the window", () => {
    const out = recent({
      recipes: [dish()],
      ingredients: [ing({ id: "ghee" }), ing({ id: "rice" })],
      meta: META,
      model: MODEL,
      history: { ghee: [change({ on: "2026-01-04" })] },
      today: TODAY,
      days: 30,
    });
    expect(out.quiet).toBe(true);
  });

  it("names only a handful of movers however many there were", () => {
    // An import can carry hundreds of rates. The totals stay exact; the named
    // list stops before it stops being a five-minute screen.
    const ids = Array.from({ length: 20 }, (_, i) => `i${String(i)}`);
    const out = recent({
      recipes: [dish()],
      ingredients: [
        ing({ id: "ghee" }),
        ing({ id: "rice" }),
        ...ids.map((id) => ing({ id, name: id })),
      ],
      meta: META,
      model: MODEL,
      history: Object.fromEntries(
        ids.map((id, n) => [
          id,
          [change({ on: "2026-08-20", from: 100, to: 100 + n })],
        ]),
      ),
      today: TODAY,
      days: 30,
    });
    expect(out.moves).toHaveLength(20);
    expect(out.leaders).toHaveLength(4);
  });
});

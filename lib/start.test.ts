import { describe, expect, it } from "vitest";

import type { LibraryRow } from "./library";
import { FREE_LIMITS, atFreeLimit } from "./org";
import { freeUsed, startOf } from "./start";

/**
 * The first six dishes, and what the screen says during them.
 *
 * What is being tested is the ORDER. Each state is only reachable once every
 * earlier one is satisfied, so the screen can never ask for a selling price
 * on a dish whose cost is still a guess — which would be asking somebody to
 * price against a number that is wrong.
 */

const row = (over: Partial<LibraryRow> = {}): LibraryRow =>
  ({
    id: "r1",
    kind: "dish",
    name: "Chicken Biryani",
    category: "Mains",
    note: "",
    componentCount: 5,
    costPerPortion: 84,
    costPerUnit: null,
    outputUnit: "g",
    sellingPrice: 280,
    foodCostPercent: 30,
    status: "under",
    complete: true,
    archived: false,
    usedIn: 0,
    updatedAt: null,
    ...over,
  }) as unknown as LibraryRow;

const start = (rows: readonly LibraryRow[], target = 30, recipeCount = rows.length) =>
  startOf({ rows, recipeCount, plan: "free", target });

describe("the next single thing", () => {
  it("asks for a first dish when there is nothing at all", () => {
    expect(start([])).toEqual({ kind: "none" });
  });

  it("asks for the missing rates before anything else", () => {
    /*
     * A dish with a rate missing has a floor, not a cost. Asking for a
     * selling price against it would be asking somebody to price off a
     * number that is wrong, which is worse than asking nothing.
     */
    const res = start([
      row({ id: "a", name: "Dosa", complete: false, costPerPortion: null, sellingPrice: null }),
      row({ id: "b", name: "Biryani" }),
    ]);
    expect(res).toEqual({
      kind: "unpriced",
      costed: 1,
      stuck: 1,
      first: "Dosa",
      firstId: "a",
    });
  });

  it("asks for a selling price once everything costs", () => {
    const res = start([
      row({ id: "a", name: "Dosa", sellingPrice: null, foodCostPercent: null }),
      row({ id: "b", name: "Biryani" }),
    ]);
    expect(res).toEqual({
      kind: "unsold",
      costed: 2,
      without: 1,
      first: "Dosa",
      firstId: "a",
    });
  });

  it("reads back the dish furthest from target, not the best one", () => {
    // A screen that opens with the dish already doing well is a screen
    // nobody acts on.
    const res = start([
      row({ id: "a", name: "Dosa", foodCostPercent: 22 }),
      row({ id: "b", name: "Biryani", foodCostPercent: 41 }),
      row({ id: "c", name: "Korma", foodCostPercent: 28 }),
    ]);
    expect(res).toMatchObject({ kind: "reading", costed: 3, over: true });
    expect(res?.kind === "reading" && res.dish.name).toBe("Biryani");
  });

  it("says nothing is over when nothing is over", () => {
    const res = start([row({ foodCostPercent: 24 })], 30);
    expect(res).toMatchObject({ kind: "reading", over: false, atLimit: false });
  });

  it("notices when the six are used up", () => {
    const rows = Array.from({ length: FREE_LIMITS.recipes }, (_, i) =>
      row({ id: `r${String(i)}`, name: `Dish ${String(i)}` }),
    );
    expect(start(rows)).toMatchObject({ atLimit: true, costed: FREE_LIMITS.recipes });
  });
});

describe("what it refuses to count or teach", () => {
  it("counts a batch against the six, because the cap does", () => {
    /*
     * A sub-recipe spends one of the six. That reads harshly — costing coffee
     * properly means a Decoction and a Filter Coffee, so one drink is two of
     * six — but `atFreeLimit` compares against `recipes.length`, and a counter
     * that said otherwise would promise a dish the door then refused.
     *
     * The guidance still talks about dishes, because a batch is not something
     * anybody plates and "price the decoction" is not a next step.
     */
    const rows = [
      row({ id: "d", kind: "dish" }),
      row({ id: "b1", kind: "batch", name: "Decoction" }),
      row({ id: "b2", kind: "batch", name: "Curry base" }),
    ];
    expect(freeUsed(3, "free")).toEqual({
      used: 3,
      left: FREE_LIMITS.recipes - 3,
      limit: FREE_LIMITS.recipes,
    });
    expect(start(rows)).toMatchObject({ costed: 1 });
  });

  it("agrees with the cap at the exact point the cap refuses", () => {
    // The one number that must never drift: what the badge says and what the
    // door does have to change on the same recipe.
    expect(freeUsed(FREE_LIMITS.recipes - 1, "free").left).toBe(1);
    expect(atFreeLimit(FREE_LIMITS.recipes - 1, "free")).toBe(false);
    expect(freeUsed(FREE_LIMITS.recipes, "free").left).toBe(0);
    expect(atFreeLimit(FREE_LIMITS.recipes, "free")).toBe(true);
  });

  it("never reports more left than there are", () => {
    expect(freeUsed(FREE_LIMITS.recipes + 3, "free").left).toBe(0);
  });

  it("says nothing at all to a paid account", () => {
    // The limit is gone and the dashboard has a sort order worth reading.
    // What would be left is a nag.
    expect(startOf({ rows: [row()], recipeCount: 1, plan: "paid", target: 30 })).toBeNull();
    expect(startOf({ rows: [], recipeCount: 0, plan: "paid", target: 30 })).toBeNull();
  });

  it("counts the same way the cap is enforced", () => {
    // The number beside the org name must never disagree with the refusal at
    // the door, so both come from the same rows and the same filter.
    const rows = [row({ id: "a" }), row({ id: "b" }), row({ id: "c", kind: "batch" })];
    expect(freeUsed(3, "free").used).toBe(3);
    expect(start(rows)).toMatchObject({ costed: 2 });
  });
});

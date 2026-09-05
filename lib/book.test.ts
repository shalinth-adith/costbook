import { beforeEach, describe, expect, it } from "vitest";

import {
  book,
  saveMeta,
  saveRecipe,
  saveSales,
  activateSubscription,
} from "./book";
import type { DishPricing } from "./data";
import * as memory from "./store";

/**
 * The book, through the path it takes without a database.
 *
 * That path is not a stub to be tolerated: it is what runs in development,
 * what every screen was built against, and — until this week — a product with
 * meaningfully different behaviour from the real one. It kept no rate
 * history, dropped a month's sales on the floor, and replaced a dish's
 * pricing where the database merged it. Those differences hid real bugs,
 * because a screen proven in development was proven against different rules.
 *
 * So these tests hold the memory path to the rules the Supabase path states.
 */
const DISH = {
  id: "dish-1",
  name: "Coconut Chutney",
  family: "count" as const,
  outputQty: 60,
  outputUnit: "pc",
  portions: 60,
  components: [],
};

beforeEach(() => {
  memory.clearBook();
  memory.setPlan("free");
});

describe("saveMeta", () => {
  it("merges a dish's pricing field by field, as the database does", async () => {
    await saveRecipe(DISH, undefined);
    /*
     * Partial patches, which is what the cost sheet actually sends: it saves
     * the one figure somebody changed. Spreading the blank pricing object
     * instead would send an explicit null for every other field, and a null
     * in a patch means "the operator cleared this" — a different instruction,
     * and the reason the first version of this test failed.
     */
    await saveMeta(DISH.id, { pricing: { targetFoodCost: 20 } as DishPricing });
    await saveMeta(DISH.id, { pricing: { labourMinutes: 40 } as DishPricing });

    const { meta } = await book();
    // Setting the minutes must not wipe a target set a week earlier. The
    // memory path replaced the whole object, so it did — here and only here,
    // which is the worst kind of difference between the two paths.
    expect(meta[DISH.id]?.pricing?.targetFoodCost).toBe(20);
    expect(meta[DISH.id]?.pricing?.labourMinutes).toBe(40);
  });

  it("clears one figure when the patch says null, and only that one", async () => {
    await saveRecipe(DISH, undefined);
    await saveMeta(DISH.id, { pricing: { targetFoodCost: 20, labourMinutes: 40 } as DishPricing });
    await saveMeta(DISH.id, { pricing: { targetFoodCost: null } as DishPricing });

    const { meta } = await book();
    expect(meta[DISH.id]?.pricing?.targetFoodCost).toBeNull();
    expect(meta[DISH.id]?.pricing?.labourMinutes).toBe(40);
  });

  it("leaves a field the patch does not mention", async () => {
    await saveRecipe(DISH, undefined);
    await saveMeta(DISH.id, { note: "Grind coarse.", sellingPrice: 3 });
    await saveMeta(DISH.id, { sellingPrice: 4 });

    const { meta } = await book();
    expect(meta[DISH.id]?.note).toBe("Grind coarse.");
    expect(meta[DISH.id]?.sellingPrice).toBe(4);
  });
});

describe("a month of sales", () => {
  it("is kept, and read back by the book", async () => {
    await saveRecipe(DISH, undefined);
    await saveSales("2026-08", [{ recipeId: DISH.id, sold: 412 }]);

    const { sales } = await book();
    expect(sales[DISH.id]?.["2026-08"]).toBe(412);
  });

  it("is replaced when the same month is entered again, not added to", async () => {
    // A till export is re-run, not appended to.
    await saveRecipe(DISH, undefined);
    await saveSales("2026-08", [{ recipeId: DISH.id, sold: 412 }]);
    await saveSales("2026-08", [{ recipeId: DISH.id, sold: 388 }]);

    const { sales } = await book();
    expect(sales[DISH.id]?.["2026-08"]).toBe(388);
  });
});

describe("a paid stretch", () => {
  it('records the term and the dates, not merely the word "paid"', async () => {
    await activateSubscription(
      "quarter",
      "sandbox",
      new Date("2026-09-05T00:00:00Z"),
    );

    const { plan, subscription } = await book();
    expect(plan).toBe("paid");
    expect(subscription.term).toBe("quarter");
    expect(subscription.reference).toBe("sandbox");
    expect(subscription.periodEnd).not.toBeNull();
    // Three months on from the day it was bought.
    expect(
      new Date(subscription.periodEnd ?? "").toISOString().slice(0, 7),
    ).toBe("2026-12");
  });

  it("starts the next stretch when the running one ends, losing nothing paid for", async () => {
    const bought = new Date("2026-09-05T00:00:00Z");
    await activateSubscription("monthly", "sandbox", bought);
    const firstEnd = (await book()).subscription.periodEnd;

    await activateSubscription("monthly", "sandbox", bought);
    const secondEnd = (await book()).subscription.periodEnd;

    expect(new Date(secondEnd ?? "").getTime()).toBeGreaterThan(
      new Date(firstEnd ?? "").getTime(),
    );
  });
});

describe("clearing the book", () => {
  it("takes the rate history and the sales with it", async () => {
    await saveRecipe(DISH, undefined);
    await saveSales("2026-08", [{ recipeId: DISH.id, sold: 10 }]);
    memory.clearBook();

    const { recipes, sales, history } = await book();
    expect(recipes).toHaveLength(0);
    expect(Object.keys(sales)).toHaveLength(0);
    expect(Object.keys(history)).toHaveLength(0);
  });
});

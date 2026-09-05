import { beforeEach, describe, expect, it } from "vitest";

import { FREE_LIMITS } from "./org";
import { importAllowed, roomForIngredient, roomForRecipe } from "./guard";
import * as memory from "./store";

/**
 * The caps, exercised through the book rather than argued about in the
 * abstract.
 *
 * With no Supabase env — which is how the test suite runs — `book()` reads
 * the in-memory store, so these run the same code path the application does,
 * against a book this file controls.
 *
 * The rule they protect is the one FLOWS 9 states and the product got wrong
 * once already: a cap is enforced where the write happens, never only on the
 * screen. A limit the browser draws and nobody checks is a decoration.
 */
function bookOf(
  recipes: number,
  ingredients: number,
  plan: "free" | "paid",
): void {
  memory.clearBook();
  memory.setPlan(plan);
  for (let i = 0; i < recipes; i += 1) {
    memory.putRecipe({
      id: `dish-${String(i)}`,
      name: `Dish ${String(i)}`,
      family: "count",
      outputQty: 1,
      outputUnit: "pc",
      portions: 1,
      components: [],
    });
  }
  for (let i = 0; i < ingredients; i += 1) {
    memory.putIngredient({
      id: `ing-${String(i)}`,
      name: `Ingredient ${String(i)}`,
      family: "mass",
      purchaseQty: 1000,
      purchasePrice: 10,
      purchaseUnit: "kg",
      yieldPercent: 100,
      yieldIsAssumed: false,
    });
  }
}

beforeEach(() => {
  bookOf(0, 0, "free");
});

describe("room for another dish", () => {
  it("lets the free trial reach its last dish", async () => {
    bookOf(FREE_LIMITS.recipes - 1, 0, "free");
    expect((await roomForRecipe()).ok).toBe(true);
  });

  it("stops the one after that, and says what stays", async () => {
    bookOf(FREE_LIMITS.recipes, 0, "free");
    const room = await roomForRecipe();
    expect(room.ok).toBe(false);
    if (room.ok) return;
    // The refusal has to say that nothing is taken away. An owner who reads
    // "you have hit a limit" and nothing else assumes their book is at risk.
    expect(room.message).toMatch(/stays costed|printable/i);
  });

  it("never stops a paid book, however many dishes it holds", async () => {
    bookOf(FREE_LIMITS.recipes * 20, 0, "paid");
    expect((await roomForRecipe()).ok).toBe(true);
  });

  it("leaves a book that is already over the cap able to keep what it has", async () => {
    // A downgrade does not delete anything: FLOWS 9 says what stops is adding.
    bookOf(FREE_LIMITS.recipes + 5, 0, "free");
    const room = await roomForRecipe();
    expect(room.ok).toBe(false);
    expect(memory.allRecipes()).toHaveLength(FREE_LIMITS.recipes + 5);
  });
});

describe("room for another ingredient", () => {
  it("was shown on screen for months and enforced nowhere", async () => {
    bookOf(0, FREE_LIMITS.ingredients, "free");
    expect((await roomForIngredient()).ok).toBe(false);
  });

  it("lets the last one in", async () => {
    bookOf(0, FREE_LIMITS.ingredients - 1, "free");
    expect((await roomForIngredient()).ok).toBe(true);
  });

  it("does not apply to a paid book", async () => {
    bookOf(0, FREE_LIMITS.ingredients + 10, "paid");
    expect((await roomForIngredient()).ok).toBe(true);
  });
});

describe("importing a sheet", () => {
  it("is the paid tier outright, not merely a repeat import", async () => {
    bookOf(0, 0, "free");
    const allowed = await importAllowed();
    expect(allowed.ok).toBe(false);
    if (allowed.ok) return;
    expect(allowed.message).toMatch(/paid tier/i);
  });

  it("opens on a paid book", async () => {
    bookOf(0, 0, "paid");
    expect((await importAllowed()).ok).toBe(true);
  });
});

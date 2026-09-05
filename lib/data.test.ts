import { describe, expect, it } from "vitest";

import { recipeCost } from "@/core/recipe";

import { ORG, dishIds, meta, pantry, recipes, shelf } from "./data";

/**
 * The development fixture, held to the rules the real book is held to.
 *
 * Every screen was built against this and several bugs hid in it rather than
 * in the code — a dish costing nothing because its lines pointed at an
 * ingredient that was not there, a meta entry for a recipe that had been
 * renamed. A fixture that cannot pass the product's own rules teaches the
 * wrong lesson to every screen built on it.
 */
describe("the fixture book", () => {
  it("has a meta entry for every recipe, and no orphans", () => {
    const ids = new Set(recipes.map((r) => r.id));
    for (const id of Object.keys(meta)) expect(ids.has(id)).toBe(true);
    for (const id of dishIds) expect(meta[id]).toBeDefined();
  });

  it("points every component at something that exists", () => {
    const ingredientIds = new Set(shelf.map((i) => i.id));
    const recipeIds = new Set(recipes.map((r) => r.id));
    for (const recipe of recipes) {
      for (const line of recipe.components) {
        if (line.kind === "ingredient")
          expect(ingredientIds.has(line.ingredientId)).toBe(true);
        if (line.kind === "recipe")
          expect(recipeIds.has(line.childId)).toBe(true);
      }
    }
  });

  it("costs every dish without throwing", () => {
    // A fixture dish the engine refuses is a screen nobody can open.
    for (const recipe of recipes) {
      expect(() => recipeCost(recipe, pantry)).not.toThrow();
    }
  });

  it("gives every dish a quantity above zero on every measured line", () => {
    for (const recipe of recipes) {
      for (const line of recipe.components) {
        if (line.kind !== "flat") expect(line.qty).toBeGreaterThan(0);
      }
    }
  });

  it("never charges a line to each portion on a batch that plates into nothing", () => {
    // The shape that used to be storable and then threw on every dashboard.
    for (const recipe of recipes) {
      if (recipe.portions !== null) continue;
      for (const line of recipe.components)
        expect(line.scope).not.toBe("portion");
    }
  });

  it("holds a target the product would accept", () => {
    expect(ORG.foodCostTarget).toBeGreaterThan(0);
    expect(ORG.foodCostTarget).toBeLessThanOrEqual(100);
  });

  it("names no ingredient twice", () => {
    const names = shelf.map((i) => i.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

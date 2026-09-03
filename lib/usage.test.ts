/**
 * How many dishes each ingredient reaches.
 *
 * The count that goes wrong quietly is the one through a sub-recipe. Count
 * only direct lines and ghee-in-the-sambar reaches one dish (the sambar),
 * when it actually moves every dish the sambar goes into.
 */

import { describe, expect, it } from "vitest";

import type { Recipe, RecipeComponent } from "@/core/recipe";

import { usageOf } from "./usage";

const ing = (id: string): RecipeComponent => ({
  kind: "ingredient",
  scope: "batch",
  ingredientId: id,
  qty: 100,
  unit: "g",
  entry: { mode: "ingredient_rate" },
});

const sub = (id: string): RecipeComponent => ({
  kind: "recipe",
  scope: "batch",
  childId: id,
  qty: 100,
  unit: "g",
  entry: { mode: "ingredient_rate" },
});

const recipe = (id: string, components: readonly RecipeComponent[]): Recipe =>
  ({
    id,
    name: id,
    family: "mass",
    outputQty: 1000,
    outputUnit: "g",
    portions: 4,
    components,
  }) as Recipe;

describe("usageOf", () => {
  it("counts a direct line", () => {
    const u = usageOf([recipe("idly", [ing("rice")])]);
    expect(u.get("rice")).toBe(1);
  });

  it("counts an ingredient reached through a sub-recipe for every dish above it", () => {
    /*
     * Ghee is only in the sambar, but the sambar is in three dishes. A rate
     * change in ghee moves all three, so ghee reaches all three — and if the
     * owner argues with the ghee supplier, that is the size of the argument.
     */
    const u = usageOf([
      recipe("sambar", [ing("ghee"), ing("dal")]),
      recipe("idly-plate", [ing("rice"), sub("sambar")]),
      recipe("dosa-plate", [ing("rice"), sub("sambar")]),
      recipe("vada-plate", [ing("dal"), sub("sambar")]),
    ]);
    // sambar itself, plus the three plates.
    expect(u.get("ghee")).toBe(4);
  });

  it("counts a dish once however many ways it reaches an ingredient", () => {
    // Dal directly on the plate and dal inside the sambar on the same plate
    // is one dish that dal reaches, not two.
    const u = usageOf([
      recipe("sambar", [ing("dal")]),
      recipe("vada-plate", [ing("dal"), sub("sambar")]),
    ]);
    expect(u.get("dal")).toBe(2);
  });

  it("does not hang on a cycle", () => {
    // The engine refuses these at write time. A walk that would spin on one
    // anyway is a walk that trusts the database more than it should.
    const u = usageOf([
      recipe("a", [ing("x"), sub("b")]),
      recipe("b", [sub("a")]),
    ]);
    expect(u.get("x")).toBe(2);
  });

  it("ignores a sub-recipe that no longer exists", () => {
    const u = usageOf([recipe("plate", [ing("rice"), sub("gone")])]);
    expect(u.get("rice")).toBe(1);
    expect(u.size).toBe(1);
  });

  it("is empty for an empty book", () => {
    expect(usageOf([]).size).toBe(0);
  });
});

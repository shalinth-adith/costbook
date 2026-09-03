/**
 * Adding a line with the quantity typed at the moment of picking.
 *
 * The old flow added every line at one purchase unit and left it to be
 * stepped down by hand — 1 kg to 250 g in steps of 50, 10, 5 and 1 is about
 * thirty presses. The dangerous part of accepting a typed amount is the unit:
 * "250 ml" of something bought by weight must be refused in words, never
 * costed at a figure the engine invented to make the families agree.
 */

import { describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";

import { addComponent } from "./edit";

const onion: Ingredient = {
  id: "onion",
  name: "Onion",
  family: "mass",
  purchaseQty: 1000,
  purchasePrice: 42,
  purchaseUnit: "kg",
  yieldPercent: 100,
  yieldIsAssumed: true,
} as Ingredient;

const dish: Recipe = {
  id: "koottu",
  name: "Koottu",
  family: "count",
  outputQty: 40,
  outputUnit: "pc",
  portions: 40,
  components: [],
} as Recipe;

const pick = { kind: "ingredient" as const, ingredient: onion };

describe("addComponent with an amount", () => {
  it("still starts at one purchase unit when no amount is given", () => {
    // The tablet path. One press adds 1 kg, as it always did.
    const r = addComponent(dish, [], [onion], pick);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const line = r.recipe.components[0];
    expect(line?.kind).toBe("ingredient");
    if (line?.kind !== "ingredient") return;
    expect(line.qty).toBe(1000);
    expect(line.unit).toBe("kg");
  });

  it("takes the quantity typed, in the unit typed", () => {
    // "250 g" is stored as 250 base units and shown back in grams.
    const r = addComponent(dish, [], [onion], pick, { qty: 250, unit: "g" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const line = r.recipe.components[0];
    if (line?.kind !== "ingredient") return;
    expect(line.qty).toBe(250);
    expect(line.unit).toBe("g");
  });

  it("converts a typed kilo figure to the base unit", () => {
    const r = addComponent(dish, [], [onion], pick, { qty: 0.25, unit: "kg" });
    if (!r.ok) return;
    const line = r.recipe.components[0];
    if (line?.kind !== "ingredient") return;
    expect(line.qty).toBe(250);
  });

  it("refuses a unit from the wrong family, in words", () => {
    /*
     * "250 ml" of a thing bought by weight. The engine cannot convert
     * volume to mass without a density nobody entered, and inventing one
     * would be a cost built on a guess. It comes back as a sentence, and
     * nothing is added.
     */
    const r = addComponent(dish, [], [onion], pick, { qty: 250, unit: "ml" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message.length).toBeGreaterThan(0);
    expect(r.message).not.toMatch(/family_mismatch/);
  });
});

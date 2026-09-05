/**
 * A pasted recipe, matched against what the kitchen already has.
 *
 * The dangerous match here is the wrong one. A missing rate announces itself —
 * the dish reports a floor and says so on every screen. An ingredient linked
 * to the wrong shelf entry announces nothing at all: it produces a cost, a
 * food cost percentage and a suggested price, all of them plausible and all of
 * them wrong.
 */

import { describe, expect, it } from "vitest";

import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";

import { draftFrom, matchKey } from "./draft";

// An oil is bought by the litre. It was "mass" here, and "10 ml Sesame oil"
// still landed, because the draft never checked the family; the create did
// not either, and stored ten grams. Now the draft says the unit does not fit.
const ing = (name: string, price: number | null = 100, family: "mass" | "volume" = "mass"): Ingredient =>
  ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    family,
    purchaseQty: 1000,
    purchasePrice: price,
    purchaseUnit: family === "mass" ? "kg" : "l",
    yieldPercent: 100,
    yieldIsAssumed: false,
  }) as Ingredient;

const rec = (name: string): Recipe =>
  ({
    id: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    family: "mass",
    outputQty: 1000,
    outputUnit: "g",
    portions: null,
    components: [],
  }) as Recipe;

const SHELF = [ing("Onion"), ing("Sesame oil", 100, "volume"), ing("Mustard seed", null)];
const RECIPES = [rec("Sambar"), rec("Coconut Chutney")];

const draft = (text: string) =>
  draftFrom({ text, shelf: SHELF, recipes: RECIPES });

describe("matchKey", () => {
  it("ignores case and punctuation", () => {
    expect(matchKey("Sesame Oil")).toBe(matchKey("sesame oil"));
    expect(matchKey("Urad dal, split")).toBe(matchKey("Urad dal split"));
  });

  it("treats a trailing plural as the same thing", () => {
    // A sheet says "Onion", a shelf says "Onions". Neither is a typo.
    expect(matchKey("Onion")).toBe(matchKey("Onions"));
  });

  it("does not go further than that", () => {
    /*
     * Deliberately not fuzzy. A near-match that links the wrong ingredient is
     * a wrong rate on every dish that uses it, and unlike a missing rate it
     * never announces itself.
     */
    expect(matchKey("Onion")).not.toBe(matchKey("Onion powder"));
    expect(matchKey("Ghee")).not.toBe(matchKey("Ginger"));
  });
});

describe("matching a pasted line", () => {
  it("finds an ingredient already on the shelf", () => {
    const d = draft("100 g Onion");
    expect(d.lines[0]?.match.kind).toBe("ingredient");
    expect(d.lines[0]?.ready).toBe(true);
    expect(d.matched).toBe(1);
  });

  it("links a recipe the kitchen already makes", () => {
    // The whole point of sub-recipes: a rate change inside sambar reaches
    // every dish above it. Costing it as a new raw ingredient breaks that.
    const d = draft("200 g Sambar");
    expect(d.lines[0]?.match.kind).toBe("recipe");
    expect(d.linked).toBe(1);
  });

  it("prefers the recipe when a name is both", () => {
    /*
     * A kitchen that makes its own sambar and buys sambar powder has both.
     * The line on a dosa means the one they make; taking the bought one
     * silently drops the link and every rate change that travelled through it.
     */
    const d = draftFrom({
      text: "200 g Sambar",
      shelf: [ing("Sambar")],
      recipes: [rec("Sambar")],
    });
    expect(d.lines[0]?.match.kind).toBe("recipe");
  });

  it("names what it would create rather than counting it", () => {
    const d = draft("100 g Onion\n50 g Tamarind\n20 g Jaggery");
    expect(d.created).toEqual(["Tamarind", "Jaggery"]);
  });

  it("does not let a dish be a component of itself", () => {
    // The cycle check would refuse it later. Refusing it here means the
    // operator never sees a line that was only ever going to be rejected.
    const d = draftFrom({
      text: "200 g Sambar",
      shelf: [],
      recipes: [rec("Sambar")],
      excludeRecipeId: "sambar",
    });
    expect(d.lines[0]?.match.kind).toBe("new");
  });
});

describe("what still needs a person", () => {
  it("counts a line with no quantity", () => {
    const d = draft("Onion");
    expect(d.lines[0]?.ready).toBe(false);
    expect(d.needing).toBe(1);
  });

  it("counts a shelf ingredient that has no rate on file", () => {
    // On the shelf is not the same as costable. Until a rate arrives the
    // dish reports a floor, and the screen says so before it is created.
    const d = draft("10 g Mustard seed");
    expect(d.lines[0]?.match.kind).toBe("ingredient");
    expect(d.lines[0]?.ready).toBe(false);
  });

  it("counts a line naming something that does not exist yet", () => {
    const d = draft("50 g Tamarind");
    expect(d.lines[0]?.ready).toBe(false);
    expect(d.needing).toBe(1);
  });

  it("is zero when every line landed", () => {
    const d = draft("100 g Onion\n10 ml Sesame oil");
    expect(d.needing).toBe(0);
    expect(d.matched).toBe(2);
  });
});

describe("a whole pasted recipe", () => {
  it("reads a mixed block the way a chef would have written it", () => {
    const d = draft(
      [
        "For the tempering:",
        "10 ml Sesame oil",
        "Mustard seed - 2 g",
        "",
        "200 g Sambar",
        "Tamarind",
      ].join("\n"),
    );
    // The heading is dropped, the blank line ignored, four lines remain.
    expect(d.lines).toHaveLength(4);
    expect(d.lines.map((l) => l.match.kind)).toEqual([
      "ingredient",
      "ingredient",
      "recipe",
      "new",
    ]);
    /*
     * Two, not three. The sesame oil is on the shelf with a rate and a
     * quantity, and the sambar is a recipe already costed — those land. What
     * needs a person is the mustard seed, which is on the shelf with no rate,
     * and the tamarind, which is not on the shelf at all.
     */
    expect(d.needing).toBe(2);
  });

  it("is empty for an empty paste, not a row of nothing", () => {
    expect(draft("").lines).toEqual([]);
    expect(draft("   \n\n ").lines).toEqual([]);
  });
});

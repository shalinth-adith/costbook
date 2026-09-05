import { describe, expect, it } from "vitest";

import type { Recipe } from "@/core/recipe";

import { parseSales } from "./sales-paste";

/**
 * A till export pasted in. Untested until now, and it decides which dish a
 * line of somebody's sales report belongs to — a wrong match puts one dish's
 * volume against another's margin, which is menu engineering pointing at the
 * wrong dish.
 */
const recipe = (id: string, name: string): Recipe =>
  ({
    id,
    name,
    family: "count",
    outputQty: 1,
    outputUnit: "pc",
    portions: 1,
    components: [],
  }) as Recipe;

const MENU = [
  recipe("dosa", "Masala Dosa"),
  recipe("idly", "Podi Idly"),
  recipe("chicken", "Chicken 65"),
];

describe("parseSales", () => {
  it("reads a name and a number, however they are separated", () => {
    const lines = parseSales(
      "Masala Dosa, 412\nPodi Idly 38\nChicken 65\t9",
      MENU,
    );
    expect(lines.map((l) => [l.recipeId, l.sold])).toEqual([
      ["dosa", 412],
      ["idly", 38],
      ["chicken", 9],
    ]);
  });

  it("names a line that matches no dish rather than guessing one", () => {
    const lines = parseSales("Filter Coffee, 88", MENU);
    expect(lines[0]?.recipeId).toBeNull();
    expect(lines[0]?.name).toContain("Filter Coffee");
  });

  it("keeps a matched dish with no number, so it can be reported not dropped", () => {
    const lines = parseSales("Masala Dosa", MENU);
    expect(lines[0]?.recipeId).toBe("dosa");
    expect(lines[0]?.sold).toBeNull();
  });

  it("ignores blank lines", () => {
    expect(parseSales("\n\n   \n", MENU)).toHaveLength(0);
  });

  it("does not read the 65 in Chicken 65 as a quantity", () => {
    // The dish is named with a number. Taking the trailing number as the
    // count would record nine as sixty-five on the one dish most likely to
    // be on a South Indian till export.
    const lines = parseSales("Chicken 65, 9", MENU);
    expect(lines[0]?.recipeId).toBe("chicken");
    expect(lines[0]?.sold).toBe(9);
  });
});

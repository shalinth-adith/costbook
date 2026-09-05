import { describe, expect, it } from "vitest";

import type { Recipe } from "@/core/recipe";

import type { DishMeta } from "./data";
import { fromRecipe, toMeta } from "./rows";

/**
 * The row mappers had no tests at all, and they are where a whole dish is
 * turned into columns. The two things below are both bugs that shipped.
 */

const RECIPE: Recipe = {
  id: "dish-1",
  name: "Coconut Chutney",
  family: "count",
  outputQty: 60,
  outputUnit: "pc",
  portions: 60,
  components: [],
};

const META: DishMeta = {
  category: "Mains",
  station: "Cold",
  portionSize: "one ladle",
  sellingPrice: 3,
  note: "Grind coarse.",
  onMenu: true,
  custom: { Allergens: "Coconut" },
};

describe("fromRecipe", () => {
  it("sends only the shape of the dish when there is no meta", () => {
    /*
     * A cost-sheet save passes no meta: it is changing lines, not what the
     * dish says about itself. This used to send every meta column as a null
     * and `custom` as an empty object, so saving a sheet wiped the allergens
     * and prep time a sheet had been imported with.
     */
    const row = fromRecipe(RECIPE, undefined, "org-1");
    expect(row["name"]).toBe("Coconut Chutney");
    expect(row["portions"]).toBe(60);
    for (const column of [
      "custom",
      "notes",
      "category",
      "selling_price",
      "priced_at",
    ]) {
      expect(row).not.toHaveProperty(column);
    }
  });

  it("sends the dish's own columns when there is meta", () => {
    const row = fromRecipe(RECIPE, META, "org-1");
    expect(row["custom"]).toEqual({ Allergens: "Coconut" });
    expect(row["notes"]).toBe("Grind coarse.");
    expect(row["selling_price"]).toBe(3);
  });

  it("calls a recipe that plates into nothing a sub-recipe", () => {
    expect(
      fromRecipe({ ...RECIPE, portions: null }, undefined, "org-1")[
        "is_sub_recipe"
      ],
    ).toBe(true);
    expect(fromRecipe(RECIPE, undefined, "org-1")["is_sub_recipe"]).toBe(false);
  });
});

describe("toMeta", () => {
  it("carries the row version, which is what a second tab is checked against", () => {
    const meta = toMeta({
      id: "dish-1",
      name: "Coconut Chutney",
      category: "Mains",
      station: null,
      portion_size: null,
      selling_price: null,
      on_menu: false,
      archived: false,
      notes: null,
      custom: {},
      updated_at: "2026-09-05T10:00:00.000Z",
    } as unknown as Parameters<typeof toMeta>[0]);
    expect(meta.updatedAt).toBe("2026-09-05T10:00:00.000Z");
  });
});

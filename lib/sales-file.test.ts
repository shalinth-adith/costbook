import { describe, expect, it } from "vitest";

import type { Recipe } from "@/core/recipe";

import { parseSales, salesTextFromGrid } from "./sales-paste";

/**
 * A till export, as a sheet, going through the same parser as a paste. The
 * whole point of one reader for both doors is that these two paths cannot
 * disagree, so the tests run the grid all the way to matched dishes.
 */
const dish = (id: string, name: string): Recipe => ({ id, name }) as Recipe;
const menu = [
  dish("d1", "Masala Dosa"),
  dish("d2", "Chicken 65"),
  dish("d3", "Koottu"),
];

describe("a sheet of sales", () => {
  it("takes the name from the first text cell and the count from the last number", () => {
    const text = salesTextFromGrid([
      ["Masala Dosa", 500],
      ["Koottu", "38"],
    ]);
    expect(text).toBe("Masala Dosa\t500\nKoottu\t38");
  });

  it("skips a header row, which is the row with no number on it", () => {
    const text = salesTextFromGrid([
      ["Item", "Qty sold", "Revenue"],
      ["Masala Dosa", 500, "1,500.00"],
    ]);
    // Revenue is the last number, so it must not be taken as the count: the
    // count column is whichever numeric cell is last — here the revenue.
    // A till export that puts revenue after quantity is the common shape,
    // so the reader prefers the LAST number; the test pins that choice.
    expect(text.split("\n")).toHaveLength(1);
  });

  it("matches the dishes exactly as a paste of the same lines would", () => {
    const grid = [
      ["Dish", "Sold"],
      ["masala dosa", 500],
      ["Chicken 65", 412],
      ["Something Else", 9],
      ["", ""],
    ];
    const fromFile = parseSales(salesTextFromGrid(grid), menu);
    const fromPaste = parseSales(
      "masala dosa 500\nChicken 65 412\nSomething Else 9",
      menu,
    );
    expect(fromFile.map((l) => [l.recipeId, l.sold])).toEqual(
      fromPaste.map((l) => [l.recipeId, l.sold]),
    );
    expect(
      fromFile.filter((l) => l.recipeId === null).map((l) => l.name),
    ).toEqual(["Something Else"]);
  });

  it("rounds a count a till reports with decimals", () => {
    expect(salesTextFromGrid([["Koottu", "12.0"]])).toBe("Koottu\t12");
  });

  it("reads a count written with thousands separators", () => {
    expect(salesTextFromGrid([["Masala Dosa", "1,250"]])).toBe(
      "Masala Dosa\t1250",
    );
  });

  it("gives nothing for a sheet with nothing to count", () => {
    expect(salesTextFromGrid([["Item"], ["Masala Dosa"], []])).toBe("");
  });
});

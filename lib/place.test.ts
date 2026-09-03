/**
 * The shape of a menu.
 *
 * The counting rules here are the ones that go wrong quietly: an archived dish
 * still in a total, a section share that does not add up, a batch counted as a
 * dish. None of them crash — they just print a number that is not true, which
 * is the failure this codebase exists to avoid.
 */

import { describe, expect, it } from "vitest";

import { BLANK_ORG } from "./org";
import type { LibraryRow } from "./library";
import { placeOf, stanceOf } from "./place";

/** A row with only the fields this module reads set to anything meaningful. */
function row(over: Partial<LibraryRow> & { name: string }): LibraryRow {
  return {
    id: over.name.toLowerCase().replace(/\s+/g, "-"),
    kind: "dish",
    category: "Tiffin",
    note: "",
    componentCount: 3,
    costPerPortion: 10,
    costPerUnit: null,
    outputUnit: "pc",
    sellingPrice: 40,
    foodCostPercent: 25,
    status: "on",
    complete: true,
    archived: false,
    usedIn: 0,
    updatedAt: null,
    matchedOn: null,
    ...over,
  };
}

const ORG = { ...BLANK_ORG, name: "Sri Krishna Café" };

describe("the shape of the menu", () => {
  it("orders sections by size, biggest first", () => {
    const place = placeOf({
      org: ORG,
      ingredientCount: 0,
      rows: [
        row({ name: "Filter Coffee", category: "Beverages" }),
        row({ name: "Idly", category: "Tiffin" }),
        row({ name: "Dosa", category: "Tiffin" }),
        row({ name: "Pongal", category: "Tiffin" }),
      ],
    });
    expect(place.sections.map((s) => s.name)).toEqual(["Tiffin", "Beverages"]);
    expect(place.sections[0]?.dishes).toBe(3);
  });

  it("breaks a tie alphabetically, so the order does not move between requests", () => {
    // Map iteration order would otherwise decide it, which is stable per
    // process and not stable across a rebuild — the kind of difference that
    // shows up as "the page keeps changing" and never as a failing test.
    const place = placeOf({
      org: ORG,
      ingredientCount: 0,
      rows: [
        row({ name: "Vada", category: "Tiffin" }),
        row({ name: "Filter Coffee", category: "Beverages" }),
      ],
    });
    expect(place.sections.map((s) => s.name)).toEqual(["Beverages", "Tiffin"]);
  });

  it("leaves archived dishes out of every count", () => {
    const place = placeOf({
      org: ORG,
      ingredientCount: 0,
      rows: [
        row({ name: "Idly" }),
        row({ name: "Retired Dosa", archived: true }),
      ],
    });
    expect(place.dishes).toBe(1);
    expect(place.sections[0]?.dishes).toBe(1);
  });

  it("counts batches apart from dishes", () => {
    // A batch is a recipe made by the batch and never plated — portions null.
    // Counting Dosa Batter as a dish would inflate the menu by every
    // sub-recipe in it, which on a real book is most of the difference.
    const place = placeOf({
      org: ORG,
      ingredientCount: 12,
      rows: [
        row({ name: "Dosa" }),
        row({ name: "Dosa Batter", kind: "batch", category: "Batches" }),
      ],
    });
    expect(place.dishes).toBe(1);
    expect(place.batches).toBe(1);
    expect(place.sections).toHaveLength(1);
    expect(place.sections[0]?.name).toBe("Tiffin");
  });

  it("separates what is costed from what is only counted", () => {
    // A dish missing a rate reports a floor, not a cost. A section reading
    // "9 dishes" when four of them cannot state a cost is the number that
    // matters here.
    const place = placeOf({
      org: ORG,
      ingredientCount: 0,
      rows: [
        row({ name: "Idly" }),
        row({ name: "Dosa", complete: false }),
        row({ name: "Pongal", complete: false }),
      ],
    });
    expect(place.dishes).toBe(3);
    expect(place.costed).toBe(1);
    expect(place.sections[0]?.costed).toBe(1);
  });

  it("counts a dish as on the menu only when it carries a price", () => {
    const place = placeOf({
      org: ORG,
      ingredientCount: 0,
      rows: [
        row({ name: "Idly" }),
        row({ name: "Staff Meal", sellingPrice: null }),
      ],
    });
    expect(place.onMenu).toBe(1);
  });

  it("shares add up to the whole menu", () => {
    const place = placeOf({
      org: ORG,
      ingredientCount: 0,
      rows: [
        row({ name: "Idly", category: "Tiffin" }),
        row({ name: "Dosa", category: "Tiffin" }),
        row({ name: "Filter Coffee", category: "Beverages" }),
        row({ name: "Tea", category: "Beverages" }),
      ],
    });
    const total = place.sections.reduce((n, s) => n + s.share, 0);
    expect(total).toBeCloseTo(100, 6);
  });

  it("does not divide by zero on an empty book", () => {
    const place = placeOf({ org: ORG, ingredientCount: 0, rows: [] });
    expect(place.sections).toEqual([]);
    expect(place.dishes).toBe(0);
    expect(place.costed).toBe(0);
  });
});

describe("the batches more than one dish leans on", () => {
  it("names only the ones actually shared, most-used first", () => {
    // A batch used by one dish is an implementation detail of that dish. A
    // batch used by eleven is how the kitchen is organised.
    const place = placeOf({
      org: ORG,
      ingredientCount: 0,
      rows: [
        row({ name: "Sambar", kind: "batch", usedIn: 11 }),
        row({ name: "Coconut Chutney", kind: "batch", usedIn: 4 }),
        row({ name: "One-Off Paste", kind: "batch", usedIn: 1 }),
      ],
    });
    expect(place.shared.map((s) => s.name)).toEqual([
      "Sambar",
      "Coconut Chutney",
    ]);
    expect(place.shared[0]?.usedIn).toBe(11);
  });

  it("stops before the list stops teaching", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      row({ name: `Batch ${String(i)}`, kind: "batch", usedIn: 20 - i }),
    );
    expect(
      placeOf({ org: ORG, ingredientCount: 0, rows: many }).shared,
    ).toHaveLength(6);
  });
});

describe("how this kitchen costs, read back", () => {
  it("says the tax answer is unanswered rather than guessing one", () => {
    // BLANK_ORG leaves taxTreatment null on purpose: either answer is wrong
    // for half of all operators, and both are wrong by a whole tax rate.
    const said = stanceOf(ORG).find((s) => s.label === "Supplier tax")?.said;
    expect(said).toBe("Not answered yet");
  });

  it("reads back the target the account actually set", () => {
    const said = stanceOf({ ...ORG, foodCostTarget: 28 }).find(
      (s) => s.label === "Aiming at",
    )?.said;
    expect(said).toContain("28%");
  });

  it("names the currency rather than printing its code", () => {
    const said = stanceOf({ ...ORG, currency: "INR" }).find(
      (s) => s.label === "Prices in",
    )?.said;
    expect(said).toContain("₹");
  });

  it("describes the rounding rule in words", () => {
    const said = stanceOf({ ...ORG, rounding: "none" }).find(
      (s) => s.label === "Prices land on",
    )?.said;
    expect(said).toContain("exact figure");
  });
});

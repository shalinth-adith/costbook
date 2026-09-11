import { describe, expect, it } from "vitest";

import { TOUR, checkWords, nextLabel, shouldTour, tourRefusal } from "./tour";

/**
 * The first-dish tour.
 *
 * What is worth proving here is not that six strings exist. It is that the
 * tour refuses to move past a field that has not been answered — which is the
 * whole difference between teaching somebody by doing and making them click
 * Next four times — and that it runs on exactly the books it should.
 */

const state = (over: Partial<Parameters<typeof tourRefusal>[1]> = {}) => ({
  name: "",
  portions: 4,
  counted: 0,
  unpriced: 0,
  ...over,
});

describe("it waits for the field it is pointing at", () => {
  it("will not leave the name until there is one", () => {
    expect(tourRefusal("name", state())).toMatch(/name/);
    expect(tourRefusal("name", state({ name: "   " }))).not.toBeNull();
    expect(tourRefusal("name", state({ name: "Chicken Biryani" }))).toBeNull();
  });

  it("will not leave the paste until a line has been read", () => {
    // "200 g onion" in the refusal is the point: it says how little is
    // needed, rather than that something is.
    expect(tourRefusal("paste", state())).toMatch(/200 g onion/);
    expect(tourRefusal("paste", state({ counted: 1 }))).toBeNull();
  });

  it("refuses a portion count that could divide nothing", () => {
    expect(tourRefusal("portions", state({ portions: 0 }))).not.toBeNull();
    expect(
      tourRefusal("portions", state({ portions: Number.NaN })),
    ).not.toBeNull();
    expect(tourRefusal("portions", state({ portions: 40 }))).toBeNull();
  });

  it("does not block the steps that are only information", () => {
    for (const id of ["section", "check", "create"] as const) {
      expect(tourRefusal(id, state())).toBeNull();
    }
  });
});

describe("the portions step makes the owner read the number back", () => {
  it("names the figure on the button instead of saying Next", () => {
    /*
     * The field arrives holding a default. A default waved through is exactly
     * the mistake this step exists to stop, so the button repeats it — and
     * still lets a default that happens to be right straight through.
     */
    expect(nextLabel("portions", state({ portions: 40 }))).toBe(
      "Yes, 40 plates",
    );
    expect(nextLabel("portions", state({ portions: 1 }))).toBe("Yes, 1 plate");
    expect(nextLabel("name", state())).toBe("Next");
    expect(nextLabel("create", state())).toBe("Got it");
  });
});

describe("pack price is taught where it bites", () => {
  it("says nothing about pricing when every line already has a price", () => {
    expect(checkWords(state({ counted: 3 }))).not.toMatch(/pack/);
  });

  it("explains pack against rate the moment an unpriced line is on screen", () => {
    const words = checkWords(state({ counted: 3, unpriced: 2 }));
    expect(words).toMatch(/^2 lines have no price/);
    expect(words).toMatch(/pack/);
  });

  it("counts one line as one line", () => {
    expect(checkWords(state({ unpriced: 1 }))).toMatch(/^One line has/);
  });
});

describe("which books it runs on", () => {
  it("runs on an empty book", () => {
    expect(shouldTour({ recipeCount: 0, forced: false, skipped: false })).toBe(
      true,
    );
  });

  it("stops the moment the book has a dish, with no flag to keep in sync", () => {
    expect(shouldTour({ recipeCount: 1, forced: false, skipped: false })).toBe(
      false,
    );
  });

  it("respects a skip, so it does not nag on every visit", () => {
    expect(shouldTour({ recipeCount: 0, forced: false, skipped: true })).toBe(
      false,
    );
  });

  it("runs when asked for by name, whatever the book holds", () => {
    // The way back in for someone who skipped it, and how it is recorded.
    expect(shouldTour({ recipeCount: 40, forced: true, skipped: true })).toBe(
      true,
    );
  });
});

describe("the steps themselves", () => {
  it("follows the screen's own order, one card after the next", () => {
    const cards = TOUR.map((s) => s.card);
    expect([...cards].sort((a, b) => a - b)).toEqual(cards);
    expect(new Set(cards)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("spends its longest explanation on portions, where the money goes wrong", () => {
    const portions = TOUR.find((s) => s.id === "portions");
    const name = TOUR.find((s) => s.id === "name");
    expect(portions?.p).toMatch(/40/);
    expect(portions?.p.length ?? 0).toBeGreaterThan(name?.p.length ?? 0);
  });
});

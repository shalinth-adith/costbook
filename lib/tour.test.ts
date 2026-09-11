import { describe, expect, it } from "vitest";

import { TOUR, checkWords, nextLabel, shouldTour } from "./tour";

/**
 * The first-dish tour.
 *
 * It shows and does not force: Next always moves on, and the last step hands
 * the screen back to be filled in. What is worth proving is that nothing in
 * it can stop an owner from clicking through, that Check says the right thing
 * for what is actually pasted, and that the word "shelf" never reaches them.
 */

describe("it never forces anybody", () => {
  it("says Next on every step but the last", () => {
    for (const s of TOUR.slice(0, -1)) expect(nextLabel(s.id)).toBe("Next");
  });

  it("ends by handing the screen back", () => {
    expect(nextLabel("create")).toBe("Start typing");
  });
});

describe("Check says what is on the screen", () => {
  it("explains the three tags when nothing has been pasted", () => {
    // The usual case in a tour clicked straight through.
    const words = checkWords({ counted: 0, unpriced: 0 });
    expect(words).toMatch(/in your ingredients/);
    expect(words).toMatch(/your batch/);
    expect(words).toMatch(/Add its price/);
  });

  it("says nothing about pricing when every line already has a price", () => {
    expect(checkWords({ counted: 3, unpriced: 0 })).not.toMatch(/pack/);
  });

  it("teaches pack price, and points at the button, when a line has none", () => {
    const words = checkWords({ counted: 3, unpriced: 2 });
    expect(words).toMatch(/^2 lines have no price/);
    expect(words).toMatch(/pack/);
    expect(words).toMatch(/Add its price/);
  });

  it("counts one line as one line", () => {
    expect(checkWords({ counted: 1, unpriced: 1 })).toMatch(/^One line has/);
  });
});

describe("the words the owner reads", () => {
  it("never says shelf", () => {
    /*
     * "On your shelf" was a word from inside the code that leaked onto the
     * screen, and the owner did not know what it meant. The product has an
     * ingredients list; every word here uses that.
     */
    const all = [
      ...TOUR.map((s) => `${s.h} ${s.p}`),
      checkWords({ counted: 0, unpriced: 0 }),
      checkWords({ counted: 2, unpriced: 0 }),
      checkWords({ counted: 2, unpriced: 1 }),
    ].join(" ");
    expect(all).not.toMatch(/shelf/i);
  });
});

describe("which books it runs on", () => {
  it("runs on an empty book", () => {
    expect(shouldTour({ recipeCount: 0, forced: false, skipped: false })).toBe(true);
  });

  it("stops the moment the book has a dish, with no flag to keep in sync", () => {
    expect(shouldTour({ recipeCount: 1, forced: false, skipped: false })).toBe(false);
  });

  it("respects a skip, so it does not nag on every visit", () => {
    expect(shouldTour({ recipeCount: 0, forced: false, skipped: true })).toBe(false);
  });

  it("runs when asked for by name, whatever the book holds", () => {
    expect(shouldTour({ recipeCount: 40, forced: true, skipped: true })).toBe(true);
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

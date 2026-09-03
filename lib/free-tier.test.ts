/**
 * The free tier, which until now was a number nobody compared anything to.
 *
 * `FREE_LIMITS` existed, `atFreeLimit` was written to read it, and no line in
 * the application called either — so Settings drew a progress bar against a
 * cap that stopped nobody, and the eleventh recipe went in like the tenth.
 * FLOWS 9 asks for it "enforced server-side on create, never only in the UI",
 * and TRD build step 25's acceptance check is that the recipe past the limit
 * is blocked server-side.
 */

import { describe, expect, it } from "vitest";

import { FREE_LIMITS, PAID_MONTHLY, atFreeLimit, canImport } from "./org";

describe("the free tier's size", () => {
  it("is ten, which is what the PRD and the flows both say", () => {
    // The code said 40. PRD 9 and FLOWS 9 have said 10 throughout. The free
    // tier is for finding out whether this works on your own menu, and a café
    // that has costed forty dishes is not evaluating any more.
    expect(FREE_LIMITS.recipes).toBe(10);
  });
});

describe("atFreeLimit", () => {
  it("lets the tenth recipe through and stops the eleventh", () => {
    // Counted as "recipes already on the book", so the boundary case is the
    // one that decides whether a café gets 10 or 9.
    expect(atFreeLimit(9, "free")).toBe(false);
    expect(atFreeLimit(10, "free")).toBe(true);
  });

  it("stops an account that is somehow over the limit", () => {
    // A downgrade leaves recipes beyond the cap in place and read-only
    // (FLOWS 9). Nothing is deleted; what stops is adding another.
    expect(atFreeLimit(80, "free")).toBe(true);
  });

  it("never stops a paid account", () => {
    for (const count of [0, 10, 11, 5000]) {
      expect(atFreeLimit(count, "paid"), String(count)).toBe(false);
    }
  });

  it("lets an empty free account start", () => {
    expect(atFreeLimit(0, "free")).toBe(false);
  });
});

describe("the paid price", () => {
  it("is written down once, so the landing and Settings cannot disagree", () => {
    // It used to live as a figure in the landing page's markup and nowhere
    // else; Settings had a "compare with paid" button that named no price and
    // changed the plan instead.
    expect(PAID_MONTHLY.amount).toBe(750);
    expect(PAID_MONTHLY.currency).toBe("INR");
  });

  it("is billed in one currency whatever the menu is priced in", () => {
    // Costbook does not convert. A subscription is not a menu price.
    expect(PAID_MONTHLY.symbol).toBe("₹");
  });
});

describe("canImport", () => {
  it("is the paid tier only", () => {
    // Not "repeat imports are paid, the first is free" — which is what the
    // Settings copy used to imply and what the code did not enforce either
    // way. A workbook is how a menu of eighty arrives, and the free tier
    // holds ten.
    expect(canImport("paid")).toBe(true);
    expect(canImport("free")).toBe(false);
  });

  it("is what keeps the recipe cap from being decorative", () => {
    // The cap says ten. An ungated import puts seventy-nine in at once, and
    // then the cap only ever stops the eightieth — which is not a cap.
    expect(canImport("free")).toBe(false);
    expect(atFreeLimit(FREE_LIMITS.recipes, "free")).toBe(true);
  });
});

/**
 * The figures, said the way a person says them.
 */

import { describe, expect, it } from "vitest";

import { dishSaid, isTrustworthy, perHundred, standingOf } from "./plain";

describe("money in every hundred", () => {
  it("says a percentage as rupees", () => {
    expect(perHundred(16.6)).toBe(17);
    expect(perHundred(33.6)).toBe(34);
  });

  it("rounds to a whole unit", () => {
    // "₹16.60 of every ₹100.00" reads like a bill rather than a fact, and the
    // decimal is precision the sentence does not carry.
    expect(perHundred(30.04)).toBe(30);
  });

  it("has nothing to say when there is nothing to say", () => {
    expect(perHundred(null)).toBeNull();
  });
});

describe("where the menu stands", () => {
  it("uses the same two-point window a dish uses", () => {
    // A menu and the dishes in it must never be described by two rules.
    expect(standingOf(33, 30)).toBe("over");
    expect(standingOf(31, 30)).toBe("about");
    expect(standingOf(29, 30)).toBe("about");
    expect(standingOf(20, 30)).toBe("under");
  });

  it("is null when nothing is costed", () => {
    expect(standingOf(null, 30)).toBeNull();
  });
});

describe("whether a headline deserves belief", () => {
  it("refuses a figure drawn from a minority of the menu", () => {
    /*
     * The live book: 23 of 79 dishes costed, running at 16.6% against a 30%
     * target. Printed large and unqualified that congratulates an operator on
     * a margin which is an artefact of the other 56 having no rate.
     */
    expect(isTrustworthy(23, 79)).toBe(false);
  });

  it("accepts one drawn from most of it", () => {
    expect(isTrustworthy(60, 79)).toBe(true);
  });

  it("is false for an empty book rather than dividing by zero", () => {
    expect(isTrustworthy(0, 0)).toBe(false);
  });

  it("takes two thirds as the line", () => {
    expect(isTrustworthy(2, 3)).toBe(true);
    expect(isTrustworthy(1, 3)).toBe(false);
  });
});

describe("a dish, said in money", () => {
  it("says what a dish costs out of what it charges", () => {
    expect(dishSaid(0.77, 2.29, "₹")).toBe(
      "₹34 of every ₹100 you charge for it",
    );
  });

  it("says nothing when either figure is missing", () => {
    // A dish with no rate reports a floor, not a cost. There is no sentence.
    expect(dishSaid(null, 2.29, "₹")).toBeNull();
    expect(dishSaid(0.77, null, "₹")).toBeNull();
  });

  it("does not divide by a price of zero", () => {
    expect(dishSaid(0.77, 0, "₹")).toBeNull();
  });
});

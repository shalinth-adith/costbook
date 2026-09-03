/**
 * The menu sorted into the four piles an owner asks about.
 *
 * The dangerous pile is the fourth. A dish with no rate reports a floor, and a
 * floor subtracted from a price is the largest margin that dish could possibly
 * have — the most flattering wrong number available, and one that would land
 * it in "earning well".
 */

import { describe, expect, it } from "vitest";

import type { DashboardRow } from "./dashboard";
import { missingSaid, pilesOf, standingOf } from "./profit";

const row = (
  name: string,
  cost: number | null,
  price: number | null,
  fc: number | null,
  gap: DashboardRow["gap"] = "none",
): DashboardRow =>
  ({
    id: name,
    name,
    category: "Tiffin",
    costPerPortion: cost,
    sellingPrice: price,
    foodCostPercent: fc,
    status: "on",
    delta: null,
    gap,
    nestedCount: 0,
    barBase: 0,
    barOver: 0,
  }) as DashboardRow;

/** Aiming to spend 30 is aiming to keep 70. */
const TARGET = 30;

describe("what one dish keeps", () => {
  it("reads the margin off the same subtraction as the cost", () => {
    // A dish spending 34 of every 100 keeps 66. Same figure, other end.
    const s = standingOf(row("Koottu", 0.77, 2.29, 34), TARGET);
    expect(s.keeps).toBe(66);
    expect(s.keepsMoney).toBeCloseTo(1.52, 6);
  });

  it("calls a dish keeping more than planned an earner", () => {
    expect(standingOf(row("Idly", 0.21, 0.96, 22), TARGET).pile).toBe(
      "earning",
    );
  });

  it("calls a dish keeping less than planned thin, not a loss", () => {
    // 34 spent keeps 66, under the 70 planned. Thin — but money is still
    // coming in, and calling it a loss would be a different and wrong word.
    expect(standingOf(row("Koottu", 0.77, 2.29, 34), TARGET).pile).toBe("thin");
  });

  it("calls a dish costing more than it sells for a loss", () => {
    /*
     * Not "a thin margin". This is money going out of the door on every plate
     * served, and it is worth a word of its own on the screen.
     */
    const s = standingOf(row("Mispriced", 5, 2, 250), TARGET);
    expect(s.pile).toBe("losing");
    expect(s.keepsMoney).toBeLessThan(0);
  });

  it("refuses to place a dish with no rate", () => {
    /*
     * The one that matters. A floor is the lowest the dish could cost, so the
     * margin computed from it is the highest it could possibly keep — this
     * dish would otherwise be filed under "earning well" precisely because
     * nobody has costed it.
     */
    const s = standingOf(row("No rate", null, 4.0, null, "no_rate"), TARGET);
    expect(s.pile).toBe("unpriced");
    expect(s.keeps).toBeNull();
    expect(s.keepsMoney).toBeNull();
  });

  it("refuses to place a dish with no price", () => {
    expect(
      standingOf(row("No price", 1.2, null, null, "no_price"), TARGET).pile,
    ).toBe("unpriced");
  });

  it("does not divide by a price of zero", () => {
    expect(standingOf(row("Free", 1, 0, null), TARGET).pile).toBe("unpriced");
  });
});

describe("the four piles", () => {
  const piles = pilesOf(
    [
      row("Idly", 0.21, 0.96, 22),
      row("Vada", 0.3, 1.5, 20),
      row("Koottu", 0.77, 2.29, 34),
      row("Mispriced", 5, 2, 250),
      row("No rate", null, 4, null, "no_rate"),
    ],
    TARGET,
  );

  it("puts every dish in exactly one", () => {
    const total =
      piles.earning.length +
      piles.thin.length +
      piles.losing.length +
      piles.unpriced.length;
    expect(total).toBe(piles.all.length);
    expect(total).toBe(5);
  });

  it("sorts the earners best first", () => {
    expect(piles.earning.map((s) => s.row.name)).toEqual(["Vada", "Idly"]);
  });

  it("sorts the ones needing work worst first", () => {
    // Whoever opens this pile is looking for the one to fix, not to browse.
    expect(piles.thin.map((s) => s.row.name)).toEqual(["Koottu"]);
  });

  it("keeps a real loss apart from a thin margin", () => {
    expect(piles.losing.map((s) => s.row.name)).toEqual(["Mispriced"]);
    expect(piles.thin.map((s) => s.row.name)).not.toContain("Mispriced");
  });

  it("lists what cannot be answered alphabetically, because it is a worklist", () => {
    expect(piles.unpriced.map((s) => s.row.name)).toEqual(["No rate"]);
  });

  it("survives an empty book", () => {
    const empty = pilesOf([], TARGET);
    expect(empty.all).toEqual([]);
    expect(empty.earning).toEqual([]);
  });
});

describe("what a dish is missing, in words", () => {
  it("says it rather than naming an enum", () => {
    expect(missingSaid(row("A", null, 1, null, "no_rate"))).toContain(
      "what an ingredient in it costs",
    );
    expect(missingSaid(row("B", 1, null, null, "no_price"))).toContain(
      "no selling price",
    );
    expect(missingSaid(row("C", 1, 1, 10, "no_portions"))).toContain(
      "by the batch",
    );
  });
});

describe("a dish nobody has costed", () => {
  it("does not come through as the best dish on the menu", () => {
    /*
     * Found on the live book. Thokku Biryani: every ingredient missing a
     * rate, so the cost computes to 0.00 — which is not null, so the null
     * checks let it through. It sorted to the top of "earning what you
     * wanted" keeping 100 of every 100, purely because nobody had costed it.
     *
     * `gap` is set by the costing rather than inferred from its output, which
     * is why it catches the zero the null checks cannot.
     */
    const s = standingOf(row("Thokku Biryani", 0, 10.3, 0, "no_rate"), TARGET);
    expect(s.pile).toBe("unpriced");
    expect(s.keeps).toBeNull();
  });

  it("treats a cost of zero as unanswered, whatever the gap says", () => {
    /*
     * The actual cause on the live book, and `gap` did not catch it: the dish
     * has no ingredient lines at all, so nothing is missing as far as the
     * engine is concerned and the total is a genuine 0.00.
     *
     * A dish made of nothing but water would be filed here too. That is the
     * safe direction — this pile is a worklist, and a dish on a worklist by
     * mistake costs ten seconds, while a dish at the top of "earning what you
     * wanted" by mistake is a lie about the best thing on the menu.
     */
    const s = standingOf(row("Empty recipe", 0, 10.3, 0), TARGET);
    expect(s.pile).toBe("unpriced");
    expect(s.keeps).toBeNull();
  });
});

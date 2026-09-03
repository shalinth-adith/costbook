/**
 * How the menu sits against its target.
 *
 * The failures here are all quiet ones: a dish at 300% falling off the end of
 * the chart, an uncosted dish counted as a zero, a median that is really a
 * mean. Every one of them produces a chart that looks right.
 */

import { describe, expect, it } from "vitest";

import type { DashboardRow } from "./dashboard";
import { medianOf, spread, worstOffenders } from "./spread";

const row = (name: string, fc: number | null): DashboardRow =>
  ({
    id: name,
    name,
    category: "Tiffin",
    costPerPortion: fc === null ? null : 10,
    sellingPrice: 40,
    foodCostPercent: fc,
    status: fc === null ? "incomplete" : fc > 30 ? "over" : "on",
    delta: null,
    gap: "none",
    nestedCount: 0,
    barBase: 0,
    barOver: 0,
  }) as DashboardRow;

describe("the distribution", () => {
  it("puts a dish in the band its food cost falls in", () => {
    const s = spread([row("A", 12), row("B", 17), row("C", 22)], 30);
    const at = (from: number) => s.bands.find((b) => b.from === from)?.count;
    expect(at(10)).toBe(1);
    expect(at(15)).toBe(1);
    expect(at(20)).toBe(1);
  });

  it("keeps a dish at the boundary out of the band below", () => {
    // 20 is the start of the 20–25 band, not the end of 15–20. Off by one
    // here shifts a whole menu one column left and looks entirely plausible.
    const s = spread([row("A", 20)], 30);
    expect(s.bands.find((b) => b.from === 15)?.count).toBe(0);
    expect(s.bands.find((b) => b.from === 20)?.count).toBe(1);
  });

  it("does not lose a dish off the end of the chart", () => {
    /*
     * 300% happens — it is what a price typed into the cost column looks
     * like. Dropping it would hide the single most wrong figure in the book
     * behind a chart that looked fine.
     */
    const s = spread([row("Typo", 300)], 30);
    const last = s.bands[s.bands.length - 1];
    expect(last?.count).toBe(1);
    expect(last?.to).toBeNull();
    expect(s.placed).toBe(1);
  });

  it("counts an uncosted dish as unplaced, never as a zero", () => {
    // A dish with no rate has no food cost. Placing it at 0% would draw a
    // column of well-performing dishes out of dishes nobody has costed.
    const s = spread([row("A", 20), row("No rate", null)], 30);
    expect(s.placed).toBe(1);
    expect(s.unplaced).toBe(1);
    expect(s.bands.find((b) => b.from === 0)?.count).toBe(0);
  });

  it("marks only the bands entirely past the target", () => {
    // The band the target sits inside holds dishes on both sides of it, so
    // painting it as over would fail dishes that are meeting the target.
    const s = spread([], 30);
    expect(s.bands.find((b) => b.from === 25)?.over).toBe(false);
    expect(s.bands.find((b) => b.from === 30)?.over).toBe(true);
    expect(s.bands.find((b) => b.from === 35)?.over).toBe(true);
  });

  it("scales heights against the tallest band", () => {
    const s = spread([row("A", 12), row("B", 13), row("C", 22)], 30);
    expect(s.bands.find((b) => b.from === 10)?.height).toBe(100);
    expect(s.bands.find((b) => b.from === 20)?.height).toBe(50);
  });

  it("survives a book with nothing costed in it", () => {
    const s = spread([row("A", null)], 30);
    expect(s.placed).toBe(0);
    expect(s.median).toBeNull();
    expect(s.bands.every((b) => b.height === 0)).toBe(true);
  });
});

describe("the median", () => {
  it("is the middle value, not the mean", () => {
    /*
     * The reason it is reported at all. Eighty cheap tiffin items and four
     * expensive biryanis have a mean nobody's dish is near; the median is
     * where the menu actually lives.
     */
    expect(medianOf([10, 12, 14, 16, 200])).toBe(14);
  });

  it("averages the two middle values on an even count", () => {
    expect(medianOf([10, 20, 30, 40])).toBe(25);
  });

  it("does not care what order it is given", () => {
    expect(medianOf([40, 10, 30, 20])).toBe(25);
  });

  it("is null for nothing, rather than zero", () => {
    expect(medianOf([])).toBeNull();
  });
});

describe("the worst offenders", () => {
  it("takes the highest food costs, worst first", () => {
    const out = worstOffenders([
      row("Fine", 18),
      row("Bad", 52),
      row("Worse", 61),
    ]);
    expect(out.map((r) => r.name)).toEqual(["Worse", "Bad", "Fine"]);
  });

  it("leaves out dishes that have no food cost at all", () => {
    // Not zero, not last — out. A shortlist to act on should hold nothing
    // whose problem is that nobody has costed it; that is a different list.
    const out = worstOffenders([row("No rate", null), row("Bad", 52)]);
    expect(out.map((r) => r.name)).toEqual(["Bad"]);
  });

  it("stops at five, because a shortlist of eighty is a list", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      row(`D${String(i)}`, 20 + i),
    );
    expect(worstOffenders(many)).toHaveLength(5);
  });

  it("breaks a tie by name so the order does not wander", () => {
    const out = worstOffenders([row("Vada", 40), row("Idly", 40)]);
    expect(out.map((r) => r.name)).toEqual(["Idly", "Vada"]);
  });
});

describe("the bands speak the product's own vocabulary", () => {
  // `statusFor` calls anything within two points of the target "near", and
  // every other screen inks on / near / over that way. A chart in one grey
  // makes the reader work out where healthy stops; nothing else here does.
  const at = (from: number) =>
    spread([], 30).bands.find((b) => b.from === from)?.status;

  it("calls a band entirely below the near window on target", () => {
    // 20–25 ends at 25, which is below 30 − 2.
    expect(at(20)).toBe("on");
  });

  it("calls a band entirely above it over", () => {
    // 35 is past 30 + 2.
    expect(at(35)).toBe("over");
  });

  it("calls a band that straddles the window near, not one or the other", () => {
    /*
     * 25–30 holds dishes at 26 (near) and 29 (near); 30–35 holds 31 (near) and
     * 34 (over). Reading either as its worse half would fail dishes that are
     * meeting the target, and a five-point column read from its midpoint lands
     * on one side of a two-point window by accident.
     */
    expect(at(25)).toBe("near");
    expect(at(30)).toBe("near");
  });

  it("moves with the target rather than being fixed", () => {
    const low = spread([], 15).bands.find((b) => b.from === 20)?.status;
    expect(low).toBe("over");
  });
});

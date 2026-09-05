import { describe, expect, it } from "vitest";

import { ago, lineQty, lineRate, rateUnitOf, shownQty, when } from "./format";

/**
 * The display helpers were untested, and one of them was the bug that made a
 * typed rate read as 0.0044 — a rate per gram, shown where a person expects a
 * rate per kilo.
 */

describe("shownQty", () => {
  it("speaks in the unit a cook would say", () => {
    expect(shownQty(500, "kg")).toEqual({ qty: "500", unit: "g" });
    expect(shownQty(2000, "kg")).toEqual({ qty: "2", unit: "kg" });
    expect(shownQty(250, "l")).toEqual({ qty: "250", unit: "ml" });
  });

  it("is the pair the Cards field reads back, so what is shown is what is stored", () => {
    // The card showed kilos and stored the typed figure as grams: 0.6 on a
    // kilo line became 0.6 g. Whatever unit this returns is the unit the
    // field converts from.
    const shown = shownQty(1000, "kg");
    expect(shown.unit).toBe("kg");
    expect(shown.qty).toBe("1");
  });
});

describe("rateUnitOf", () => {
  it("quotes a rate by the kilo and the litre, never by the gram", () => {
    expect(rateUnitOf("g")).toBe("kg");
    expect(rateUnitOf("kg")).toBe("kg");
    expect(rateUnitOf("ml")).toBe("l");
    expect(rateUnitOf("l")).toBe("l");
    expect(rateUnitOf("pc")).toBe("pc");
  });
});

describe("lineRate", () => {
  it("scales a per-base rate up to the unit it is quoted in", () => {
    // 0.0044 a gram is 4.40 a kilo, which is the figure on a supplier's bill.
    expect(lineRate(0.0044, "kg")).toBeCloseTo(4.4, 10);
    expect(lineRate(null, "kg")).toBeNull();
  });
});

describe("lineQty", () => {
  it("prints a whole number without a false precision", () => {
    expect(lineQty(1000, "kg")).toBe("1");
  });
});

describe("ago", () => {
  it("says today, yesterday, and then counts", () => {
    expect(ago(0)).toMatch(/today/i);
    expect(ago(1)).toMatch(/yesterday/i);
    expect(ago(null)).toMatch(/never|—|not/i);
  });
});

describe("when", () => {
  it("is empty for a date nobody set", () => {
    expect(when(null, "2026-09-05")).toMatch(/never|—|not/i);
  });
});

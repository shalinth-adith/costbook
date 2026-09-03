/**
 * A quantity in the unit a cook would say it in.
 *
 * The stored figure is in base units and must not move. Only how it is said
 * changes: 30 ml is "30 ml", not "0.03 l"; a kilo and a half is still "1.5 kg".
 */

import { describe, expect, it } from "vitest";

import { shownQty } from "./format";

describe("shownQty", () => {
  it("says a small volume in millilitres, not a fraction of a litre", () => {
    // The line that started this: ghee on the Koottu sheet read "0.03 l".
    expect(shownQty(30, "l")).toEqual({ qty: "30", unit: "ml" });
  });

  it("says a small mass in grams, not a fraction of a kilo", () => {
    // "0.01 kg" of curry leaf is 10 g to anybody who has held one.
    expect(shownQty(10, "kg")).toEqual({ qty: "10", unit: "g" });
    expect(shownQty(250, "kg")).toEqual({ qty: "250", unit: "g" });
  });

  it("keeps the big unit at or above a whole one", () => {
    expect(shownQty(1000, "kg")).toEqual({ qty: "1", unit: "kg" });
    expect(shownQty(1500, "kg")).toEqual({ qty: "1.5", unit: "kg" });
    expect(shownQty(2000, "l")).toEqual({ qty: "2", unit: "l" });
  });

  it("leaves pieces alone, because there is no smaller piece", () => {
    expect(shownQty(3, "pc")).toEqual({ qty: "3", unit: "pc" });
  });

  it("leaves a line already in grams or millilitres as it is", () => {
    expect(shownQty(500, "g")).toEqual({ qty: "500", unit: "g" });
    expect(shownQty(40, "ml")).toEqual({ qty: "40", unit: "ml" });
  });

  it("does not touch a unit it does not know", () => {
    expect(shownQty(2, "tin").unit).toBe("tin");
  });
});

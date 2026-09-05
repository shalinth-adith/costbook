/**
 * A quantity, said in the unit it was written in.
 *
 * This file used to assert the opposite, and the reason it did is worth
 * keeping: a Koottu sheet imported with ghee in litres displayed "0.03 l",
 * which is 30 ml to anybody who has poured it. The fix then was to convert
 * by magnitude — anything under a kilo shown in grams, anything under a litre
 * in millilitres.
 *
 * That fix cured the symptom and created a worse disease. It also meant that
 * a person who typed 0.8 kg of rice was shown 800 g, and one who typed
 * 1500 g was shown 1.5 kg. A costing tool that restates a kitchen's own
 * figures in units it did not choose is one whose every figure gets checked
 * twice, which is the opposite of the product's whole argument.
 *
 * So the unit is kept. The ghee case is real and its answer belongs where
 * the line is made rather than where it is drawn: a sheet whose column says
 * litres and whose amount is a millilitre amount is a sheet the importer
 * should read in millilitres. Until that is built, an imported line reads in
 * the unit its sheet used, which is at least that sheet's own word.
 */

import { describe, expect, it } from "vitest";

import { shownQty } from "./format";

describe("shownQty", () => {
  it("keeps a small amount in the big unit, because that is what was written", () => {
    // The old rule turned each of these into the smaller unit. Faithful now.
    expect(shownQty(30, "l")).toEqual({ qty: "0.03", unit: "l" });
    expect(shownQty(10, "kg")).toEqual({ qty: "0.01", unit: "kg" });
    expect(shownQty(800, "kg")).toEqual({ qty: "0.8", unit: "kg" });
  });

  it("keeps a large amount in the small unit, for the same reason", () => {
    expect(shownQty(1500, "g")).toEqual({ qty: "1500", unit: "g" });
    expect(shownQty(2500, "ml")).toEqual({ qty: "2500", unit: "ml" });
  });

  it("still converts out of base units, which is not a choice", () => {
    // Every quantity is stored in base units. Printing 1500 beside "kg"
    // would be wrong by a factor of a thousand.
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

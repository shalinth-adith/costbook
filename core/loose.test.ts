/**
 * A line of a recipe, written the way a person writes one.
 *
 * The whole risk here is confident wrongness. A parser that reads "Chicken 65"
 * as 65 of something, or "1 tin oil" as one tin, produces a quantity that
 * looks entered and is invented — and a quantity is a cost, and a cost is a
 * price on a menu. Where it cannot tell, it must say so.
 */

import { describe, expect, it } from "vitest";

import { looseNumber, parseLooseBlock, parseLooseLine } from "./loose";

describe("the number, however it was written", () => {
  it("reads a plain number", () => {
    expect(looseNumber("100")).toBe(100);
    expect(looseNumber("1.5")).toBe(1.5);
  });

  it("reads a fraction, which is how a recipe is written", () => {
    expect(looseNumber("1/2")).toBe(0.5);
    expect(looseNumber("3/4")).toBe(0.75);
  });

  it("reads a whole and a fraction together", () => {
    expect(looseNumber("1 1/2")).toBe(1.5);
  });

  it("reads the fraction characters a phone keyboard produces", () => {
    expect(looseNumber("½")).toBe(0.5);
    expect(looseNumber("1½")).toBe(1.5);
  });

  it("reads a comma as a decimal point", () => {
    // Most of the world writes 1,5 for one and a half.
    expect(looseNumber("1,5")).toBe(1.5);
  });

  it("reads a comma as a thousands separator when it is one", () => {
    expect(looseNumber("2,400")).toBe(2400);
  });

  it("returns null rather than NaN", () => {
    // NaN propagates into a cost and prints as a figure.
    expect(looseNumber("onion")).toBeNull();
    expect(looseNumber("")).toBeNull();
    expect(looseNumber("1/0")).toBeNull();
  });
});

describe("quantity and unit in front", () => {
  it("reads the commonest shape", () => {
    const l = parseLooseLine("100 g Onion");
    expect(l).toMatchObject({
      name: "Onion",
      qty: 100,
      unit: "g",
      needs: null,
    });
  });

  it("reads it with no space between number and unit", () => {
    expect(parseLooseLine("100g Onion")).toMatchObject({
      name: "Onion",
      qty: 100,
      unit: "g",
    });
  });

  it("normalises the unit the operator typed", () => {
    // `gms` is what a sheet says. `g` is what the engine uses.
    expect(parseLooseLine("250 gms Sugar").unit).toBe("g");
  });

  it("reads a fraction quantity", () => {
    expect(parseLooseLine("1/2 kg Rice")).toMatchObject({
      name: "Rice",
      qty: 0.5,
      unit: "kg",
    });
  });

  it("keeps a describing word in the name rather than taking it as a unit", () => {
    // "large" is not a unit, so it belongs to the onions.
    expect(parseLooseLine("2 large Onions")).toMatchObject({
      name: "large Onions",
      qty: 2,
      unit: null,
      needs: "unit",
    });
  });

  it("asks for a unit rather than assuming one", () => {
    /*
     * "2 Onions" could be two of them or two kilos. Assuming either is the
     * plausible wrong number this whole codebase is built to refuse, so the
     * line comes through and says what it is missing.
     */
    expect(parseLooseLine("2 Onions")).toMatchObject({
      qty: 2,
      unit: null,
      needs: "unit",
    });
  });
});

describe("quantity and unit at the end", () => {
  it("reads the column-order shape", () => {
    expect(parseLooseLine("Onion 100 g")).toMatchObject({
      name: "Onion",
      qty: 100,
      unit: "g",
      needs: null,
    });
  });

  it("reads it with a dash between", () => {
    expect(parseLooseLine("Sesame oil - 10g")).toMatchObject({
      name: "Sesame oil",
      qty: 10,
      unit: "g",
    });
    expect(parseLooseLine("Ghee — 50 g")).toMatchObject({
      name: "Ghee",
      qty: 50,
      unit: "g",
    });
  });

  it("reads a multi-word name before the quantity", () => {
    expect(parseLooseLine("Urad dal, split 3 g")).toMatchObject({
      name: "Urad dal, split",
      qty: 3,
      unit: "g",
    });
  });
});

describe("numbers that are part of the name", () => {
  it("does not turn Chicken 65 into 65 chickens", () => {
    /*
     * The one that would hurt most, and it is a real dish. The trailing word
     * after the number is missing, so there is nothing to read as a unit —
     * and a number with no unit at the end of a name is far more likely to be
     * the name.
     */
    const l = parseLooseLine("Chicken 65");
    expect(l.qty).toBeNull();
    expect(l.name).toBe("Chicken 65");
    expect(l.needs).toBe("quantity");
  });

  it("does not turn Gravy 2 into two gravies", () => {
    expect(parseLooseLine("Thooku Chatti Parotta - Gravy 2").qty).toBeNull();
  });
});

describe("lines that need a person", () => {
  it("takes a name with no quantity, because that is how a list starts", () => {
    // A chef lists what goes in before how much of it.
    expect(parseLooseLine("Coconut")).toMatchObject({
      name: "Coconut",
      qty: null,
      needs: "quantity",
    });
  });

  it("says so when there is a quantity and nothing to weigh", () => {
    expect(parseLooseLine("500 g")).toMatchObject({ qty: 500, needs: "name" });
  });

  it("never invents a quantity it did not read", () => {
    for (const line of [
      "Salt to taste",
      "Oil as required",
      "A pinch of hing",
    ]) {
      expect(parseLooseLine(line).qty, line).toBeNull();
    }
  });
});

describe("a pasted block", () => {
  it("reads each line", () => {
    const out = parseLooseBlock("100 g Onion\n2 kg Rice\n10 ml Oil");
    expect(out.map((l) => l.name)).toEqual(["Onion", "Rice", "Oil"]);
    expect(out.map((l) => l.qty)).toEqual([100, 2, 10]);
  });

  it("ignores blank lines rather than making empty rows of them", () => {
    expect(parseLooseBlock("100 g Onion\n\n\n2 kg Rice")).toHaveLength(2);
  });

  it("drops a heading rather than costing it", () => {
    // "For the tempering:" is not an ingredient, and a row named for one
    // would sit in the dish forever reporting a floor.
    const out = parseLooseBlock("For the tempering:\n10 g Mustard seed");
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("Mustard seed");
  });

  it("copes with the carriage returns a paste from Windows carries", () => {
    expect(parseLooseBlock("100 g Onion\r\n2 kg Rice")).toHaveLength(2);
  });

  it("is empty for an empty paste", () => {
    expect(parseLooseBlock("")).toEqual([]);
    expect(parseLooseBlock("   \n  \n")).toEqual([]);
  });
});

describe("a rate on the line, as a sheet carries one", () => {
  it("reads a rate after an at-sign, per the unit after the slash", () => {
    const l = parseLooseLine("260 g Onion @ 5.08/kg");
    expect([l.qty, l.unit, l.name, l.rate, l.rateUnit]).toEqual([260, "g", "Onion", 5.08, "kg"]);
  });
  it("reads 'per' and 'a' as the slash", () => {
    expect(parseLooseLine("Ghee 50 ml at 34 per l").rate).toBe(34);
    expect(parseLooseLine("50 ml Ghee 34 a l").rateUnit).toBe("l");
  });
  it("reads the sheet's own column order: name, quantity, unit, rate", () => {
    const l = parseLooseLine("Idly Rice, 8, kg, 3.16");
    expect([l.name, l.qty, l.unit, l.rate, l.rateUnit, l.needs]).toEqual(["Idly Rice", 8, "kg", 3.16, "kg", null]);
    expect(parseLooseLine("Salt\t0.14\tkg\t1.16").rate).toBe(1.16);
  });
  it("leaves a line without a rate exactly as before", () => {
    const l = parseLooseLine("Onion 100 g");
    expect([l.qty, l.unit, l.rate, l.perPlate]).toEqual([100, "g", null, false]);
  });
  it("turns a cost with a label into something that needs nobody", () => {
    // The sheet's "Poriya (side), 13 portion, 0.5": no unit Costbook weighs,
    // but a rate beside it. 13 × 0.5 is the line's cost, and it is ready.
    const m = parseLooseLine("Poriya (side), 13, portion, 0.5");
    expect([m.name, m.qty, m.unit, m.rate, m.rateUnit, m.needs]).toEqual(["Poriya (side)", 13, null, 0.5, "portion", null]);
    const l = parseLooseLine("13 portion Poriya (side) @ 0.5/portion");
    expect([l.qty, l.unit, l.rate, l.needs]).toEqual([13, null, 0.5, null]);
  });
});

describe("on every plate", () => {
  it("reads 'per plate' and its cousins", () => {
    expect(parseLooseLine("50 ml Ghee per plate").perPlate).toBe(true);
    expect(parseLooseLine("1 pc Papad each").perPlate).toBe(true);
    expect(parseLooseLine("50 ml Ghee").perPlate).toBe(false);
  });
  it("keeps the rate and the plate together", () => {
    const l = parseLooseLine("50 ml Ghee @ 34/l per plate");
    expect([l.qty, l.unit, l.rate, l.rateUnit, l.perPlate]).toEqual([50, "ml", 34, "l", true]);
  });
});

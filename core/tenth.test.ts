/**
 * Up to the next 0.10 — the rounding a small-plate kitchen actually wants.
 *
 * The owner's own examples: a plate whose sum is 2.56 should be 2.60, one at
 * 2.73 should be 2.80. Not 2.90, which is what "next figure ending in 9"
 * made of it, and not a choice between 2.90 and 3.00.
 */

import { describe, expect, it } from "vitest";

import { PRESETS, applyRounding } from "./rounding";

const tenth = PRESETS.up_to_tenth;

describe("up to the next tenth", () => {
  it("turns 2.56 into 2.60", () => {
    expect(applyRounding(2.56, tenth)).toBeCloseTo(2.6, 9);
  });

  it("turns 2.73 into 2.80", () => {
    expect(applyRounding(2.73, tenth)).toBeCloseTo(2.8, 9);
  });

  it("leaves a figure already on a tenth alone", () => {
    // Up, not up-and-over: 2.50 is 2.50, not 2.60.
    expect(applyRounding(2.5, tenth)).toBeCloseTo(2.5, 9);
  });

  it("never rounds down", () => {
    // A price rounded down is a margin rounded down.
    expect(applyRounding(2.51, tenth)).toBeCloseTo(2.6, 9);
  });

  it("is the default a new account starts with", async () => {
    const { DEFAULT_MODEL } = await import("@/lib/costing");
    const { BLANK_ORG } = await import("@/lib/org");
    expect(DEFAULT_MODEL.rounding).toBe("up_to_tenth");
    expect(BLANK_ORG.rounding).toBe("up_to_tenth");
  });
});

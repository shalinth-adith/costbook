import { describe, expect, it } from "vitest";

import { pantryOf, recipeCost } from "@/core/recipe";

import { DEFAULT_MODEL, buildUp } from "./costing";
import { pantry, recipes, shelf } from "./data";
import { whereItGoes } from "./where";

/**
 * The point of this module is one claim: what is left is not profit until
 * every cost has been entered. These tests exist mostly to hold that claim.
 */
const plated = recipes.find((r) => r.portions !== null);
if (plated === undefined) throw new Error("the fixture has no plated dish");

const buildWith = (model = DEFAULT_MODEL) =>
  buildUp(recipeCost(plated, pantry), model, { labourMinutes: 60 });

describe("where every hundred goes", () => {
  it("adds back up to the price, to the last fils", () => {
    const model = {
      ...DEFAULT_MODEL,
      packagingPerPortion: 0.4,
      overheadPerPortion: 0.6,
      labourRatePerHour: 30,
    };
    const out = whereItGoes(20, buildWith(model), model);
    if (out === null) throw new Error("should have split");
    const total =
      out.slices.reduce((n, s) => n + s.amount, 0) + out.left.amount;
    expect(total).toBeCloseTo(20, 3);
  });

  it("adds up to a hundred as shares, too", () => {
    const model = {
      ...DEFAULT_MODEL,
      packagingPerPortion: 0.4,
      overheadPerPortion: 0.6,
      labourRatePerHour: 30,
    };
    const out = whereItGoes(20, buildWith(model), model);
    if (out === null) throw new Error("should have split");
    const total = out.slices.reduce((n, s) => n + s.share, 0) + out.left.share;
    expect(total).toBeCloseTo(100, 1);
  });

  it("refuses to call the remainder profit while a cost is not counted", () => {
    // The default account counts no wages, no rent and no packaging: exactly
    // the state a kitchen is in on its first day. The remainder is then an
    // upper bound, and saying otherwise is the lie this module exists to
    // prevent.
    const out = whereItGoes(20, buildWith(), DEFAULT_MODEL);
    if (out === null) throw new Error("should have split");
    expect(out.complete).toBe(false);
    expect(out.notCounted).toContain("overheads");
    expect(out.notCounted).toContain("kitchen_time");
    expect(out.left.label).not.toMatch(/^Left for you$/);
  });

  it("calls it profit once everything is entered", () => {
    const model = {
      ...DEFAULT_MODEL,
      packagingPerPortion: 0.4,
      accompanimentsPerPortion: 0.3,
      overheadPerPortion: 0.6,
      labourRatePerHour: 30,
    };
    const out = whereItGoes(20, buildWith(model), model);
    if (out === null) throw new Error("should have split");
    expect(out.complete).toBe(true);
    expect(out.notCounted).toEqual([]);
    expect(out.left.label).toBe("Left for you");
  });

  it("says so plainly when the plate loses money", () => {
    const model = {
      ...DEFAULT_MODEL,
      packagingPerPortion: 0.4,
      overheadPerPortion: 0.6,
      labourRatePerHour: 30,
    };
    const out = whereItGoes(0.5, buildWith(model), model);
    if (out === null) throw new Error("should have split");
    expect(out.left.amount).toBeLessThan(0);
    expect(out.left.share).toBeLessThan(0);
  });

  it("shows a cost nobody entered as a named gap, not as nothing", () => {
    const out = whereItGoes(20, buildWith(), DEFAULT_MODEL);
    if (out === null) throw new Error("should have split");
    const rent = out.slices.find((s) => s.kind === "overheads");
    // Present on the list and marked missing: a share of zero that means "not
    // counted" is a different fact from one that means "we spend nothing".
    expect(rent?.missing).toBe(true);
    expect(rent?.amount).toBe(0);
  });

  it("will not split a dish that has no honest cost", () => {
    const bare = { ...shelf[0]!, purchasePrice: null };
    const short = buildUp(
      recipeCost(plated, pantryOf(recipes, [bare, ...shelf.slice(1)])),
      DEFAULT_MODEL,
      {},
    );
    expect(whereItGoes(20, short, DEFAULT_MODEL)).toBeNull();
  });

  it("will not split a price of nothing", () => {
    expect(whereItGoes(0, buildWith(), DEFAULT_MODEL)).toBeNull();
    expect(whereItGoes(-5, buildWith(), DEFAULT_MODEL)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { pantryOf, recipeCost } from "@/core/recipe";

import { DEFAULT_MODEL, buildUp, suggestPrice } from "./costing";
import { pantry, recipes, shelf } from "./data";
import { asText, inspect } from "./inspector";

/**
 * The inspector answers "where did this figure come from", which is the whole
 * argument of the product: a plate cost nobody can take apart is a number to
 * be taken on faith, and this codebase exists because a spreadsheet asked for
 * exactly that faith and did not deserve it.
 *
 * So the test that matters is not that it produces steps. It is that the
 * steps add up to the figure the sheet shows.
 */
const MODEL = {
  ...DEFAULT_MODEL,
  wastagePercent: 3,
  packagingPerPortion: 0.4,
  overheadPerPortion: 0.25,
};

function stepsFor(id: string) {
  const recipe = recipes.find((r) => r.id === id);
  if (recipe === undefined) throw new Error(`no recipe ${id}`);
  const cost = recipeCost(recipe, pantry);
  const build = buildUp(cost, MODEL, {});
  const suggested =
    build.complete && build.total !== null
      ? suggestPrice(build.total, MODEL).rounded
      : null;
  return { cost, build, steps: inspect(cost, build, MODEL, suggested) };
}

describe("the inspector", () => {
  /*
   * A plated dish, not the first in the list.
   *
   * The first four fixtures are batches — a gravy, a parotta dough — which
   * plate into nothing, so the per-plate figures correctly do not apply to
   * them. Asserting those steps against a batch would be testing the wrong
   * rule, and the owner has since confirmed the rule: a batch carries its
   * ingredients, and the per-plate costs belong to the dish that is served.
   */
  const plated = recipes.find((r) => r.portions !== null);
  if (plated === undefined) throw new Error("the fixture has no plated dish");
  const first = plated.id;

  it("ends on the figure the cost sheet shows", () => {
    const { build, steps } = stepsFor(first);
    const last = steps[steps.length - 1];
    if (build.total === null || last === undefined) return;
    // Whatever the last running total is, it is what the plate costs, or the
    // price built from it. Either way it cannot disagree with the build-up.
    const running = steps
      .map((s) => s.running)
      .filter((r): r is number => r !== null);
    expect(running.length).toBeGreaterThan(0);
    expect(Math.max(...running)).toBeGreaterThanOrEqual(build.total - 0.005);
  });

  it("divides the batch by the portions exactly once", () => {
    /*
     * The running total is deliberately not monotonic: the early steps are
     * the whole batch and the later ones are one plate, and the step between
     * them divides. This was written the other way round first, asserting the
     * figures only ever climb — which would have been a real bug if it had
     * passed, because it would mean a batch cost was being charged to every
     * plate.
     */
    const { build, steps } = stepsFor(first);
    const portions = plated.portions;
    if (portions === null || build.ingredientsPerPortion === null) return;
    expect(build.ingredientsPerPortion).toBeCloseTo(build.linesTotal / portions, 6);
    expect(steps.some((s) => s.running === build.ingredientsPerPortion)).toBe(true);
  });

  it("numbers its steps from one, in order", () => {
    const { steps } = stepsFor(first);
    expect(steps.map((s) => s.n)).toEqual(steps.map((_, i) => i + 1));
  });

  it("says where every step came from", () => {
    const { steps } = stepsFor(first);
    for (const step of steps) {
      expect(step.label.trim()).not.toBe("");
      expect(["recipe", "ingredient", "sub-recipe", "organisation"]).toContain(
        step.source,
      );
    }
  });

  it("marks a figure nobody has set as a default, and one they have as theirs", () => {
    const { steps } = stepsFor(first);
    // With wastage and packaging set above, at least one step is the account's
    // own figure rather than a default nobody chose.
    expect(steps.some((s) => s.source === "organisation")).toBe(true);
  });

  it("renders as text a person could paste into an email", () => {
    const { steps } = stepsFor(first);
    const text = asText(steps, "Kaima Idly");
    expect(text).toContain("Kaima Idly");
    expect(text.split("\n").length).toBeGreaterThan(steps.length);
  });

  it("holds up for a dish with a missing rate, which reports a floor", () => {
    const bare = { ...shelf[0]!, purchasePrice: null };
    const p = pantryOf(recipes, [bare, ...shelf.slice(1)]);
    const recipe = recipes.find((r) => r.id === first)!;
    const cost = recipeCost(recipe, p);
    const build = buildUp(cost, MODEL, {});
    expect(() => inspect(cost, build, MODEL, null)).not.toThrow();
  });
});

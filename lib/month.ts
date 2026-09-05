import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";

import type { CostingModel } from "./costing";
import type { DishMeta } from "./data";
import { type Impact, impactOf } from "./impact";
import type { RateChange } from "./org";
import { movesSince, rollBack } from "./recent";

/**
 * One month against the month before it.
 *
 * The dashboard already answers "what moved in the last thirty days", which
 * is the right question on any given Tuesday. It is not the question a
 * monthly costing asks. A kitchen that closes its books each month wants to
 * know what August did to its plate costs against July, and which suppliers
 * are responsible — a fixed window with an edge, not a window that slides
 * out from under yesterday's answer.
 *
 * No snapshot is taken and no table is added. Every rate change is already
 * recorded with its date, so the book as it stood on any past evening is the
 * book as it stands now with every later change rolled back. That has the
 * pleasant property of working for months that passed before this screen
 * existed.
 *
 * WHAT IT DOES NOT CLAIM. Recipes are not versioned: this shows what the
 * dishes as they are today would have cost at each month's rates. A dish
 * whose lines changed in September is compared on September's lines at
 * August's and July's rates. So it isolates one thing — what the rates did —
 * and the screen says so rather than implying a full historical restatement.
 */
export interface MonthCompare {
  /** The month reported, `YYYY-MM`. */
  readonly period: string;
  /** The month it is measured against. */
  readonly against: string;
  /** Total plate cost across every dish costable at both dates. Null when none is. */
  readonly costThen: number | null;
  readonly costNow: number | null;
  /** Points of movement, positive for dearer. Null when there is nothing to compare. */
  readonly percent: number | null;
  /** Dishes whose cost moved at all, and which way. */
  readonly dearer: number;
  readonly cheaper: number;
  /** The dish-by-dish detail, and which dishes crossed their target. */
  readonly impact: Impact;
  /**
   * Rates that moved on the shelf and could not reach a dish, because every
   * line using them carries a rate of its own.
   *
   * A book built by pasting a sheet has a typed rate on every line — that is
   * the point of honouring the sheet — and such a line does not follow the
   * shelf. So a month can show real supplier movement and a perfectly still
   * menu, and the honest screen says which of the two happened rather than
   * implying the amounts were too small to matter.
   */
  readonly frozenByLineRates: number;
  /**
   * Whether any rate moved at all in the month.
   *
   * A month where nothing moved is a real and good answer, and it must not
   * be dressed up as a 0.0% change — that reads like an arithmetic result
   * rather than "your suppliers held".
   */
  readonly rateMoves: number;
}

export interface MonthInput {
  readonly recipes: readonly Recipe[];
  readonly ingredients: readonly Ingredient[];
  readonly meta: Readonly<Record<string, DishMeta>>;
  readonly model: CostingModel;
  readonly history: Readonly<Record<string, readonly RateChange[]>>;
  /** The month to report, `YYYY-MM`. */
  readonly period: string;
}

/** The day after the last day of a month, as `YYYY-MM-DD`. */
export function monthAfter(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 + 1, 1));
  return d.toISOString().slice(0, 10);
}

/** The month before, `YYYY-MM`. */
export function monthBefore(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1 - 1, 1));
  return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The shelf as it stood at the end of a month.
 *
 * Every change dated on or after the first of the next month, undone. A rate
 * that arrived in the window is left alone: rolling a first rate back leaves
 * the ingredient with no rate, which makes every dish above it uncostable and
 * would report a menu as having risen from nothing.
 */
export function shelfAtEndOf(
  period: string,
  ingredients: readonly Ingredient[],
  history: Readonly<Record<string, readonly RateChange[]>>,
): readonly Ingredient[] {
  const after = movesSince(history, ingredients, monthAfter(period)).filter(
    (m) => m.from !== null,
  );
  return rollBack(ingredients, after);
}

export function compareMonth(input: MonthInput): MonthCompare {
  const against = monthBefore(input.period);

  const then = shelfAtEndOf(against, input.ingredients, input.history);
  const now = shelfAtEndOf(input.period, input.ingredients, input.history);

  const impact = impactOf({
    recipes: input.recipes,
    ingredients: then,
    nextIngredients: now,
    meta: input.meta,
    model: input.model,
  });

  /*
   * Totalled over the dishes costable at both dates, so the figure is a
   * comparison rather than a scoreboard of how much of the menu happens to
   * be costable this week. A dish that became costable during the month
   * would otherwise show up as pure inflation.
   */
  let costThen = 0;
  let costNow = 0;
  let counted = 0;
  let dearer = 0;
  let cheaper = 0;

  for (const m of impact.moved) {
    if (m.oldCost === null || m.newCost === null) continue;
    /*
     * A cost that is not a number is not a comparison. Nothing in the engine
     * should produce one, but the alternative to this line is a dashboard
     * headline reading "NaN%" — a wrong figure is worse than a missing one,
     * and this is the single place every dish total passes through.
     */
    if (!Number.isFinite(m.oldCost) || !Number.isFinite(m.newCost)) continue;
    costThen += m.oldCost;
    costNow += m.newCost;
    counted += 1;
    if (m.newCost > m.oldCost) dearer += 1;
    else if (m.newCost < m.oldCost) cheaper += 1;
  }

  /*
   * Counted from the history rather than from `movesSince`.
   *
   * That helper collapses every change to one ingredient inside its window
   * into a single net move dated by the newest of them — right for "where
   * does ghee stand against a month ago", wrong here: a rise in September
   * would carry August's move out of August and report a month in which
   * nothing happened.
   */
  const firstDay = `${input.period}-01`;
  const dayAfter = monthAfter(input.period);
  const movedIds = Object.entries(input.history)
    .filter(([, changes]) =>
      changes.some(
        (c) => c.from !== null && c.on >= firstDay && c.on < dayAfter,
      ),
    )
    .map(([id]) => id);
  const movedRates = movedIds.length;

  /*
   * A rate that moved and had nowhere to land. Counted per ingredient: every
   * line that uses it prices off a rate somebody typed on the line, so the
   * shelf moving changes nothing about what the dish costs. True and worth
   * saying — it is also how somebody discovers that their imported sheet
   * froze its own prices.
   */
  const frozen = movedIds.filter((id) => {
    const lines = input.recipes.flatMap((r) =>
      r.components.filter(
        (c) => c.kind === "ingredient" && c.ingredientId === id,
      ),
    );
    return (
      lines.length > 0 &&
      lines.every(
        (c) => c.kind === "ingredient" && c.entry.mode !== "ingredient_rate",
      )
    );
  }).length;

  return {
    period: input.period,
    against,
    costThen: counted === 0 ? null : round(costThen),
    costNow: counted === 0 ? null : round(costNow),
    percent:
      counted === 0 || costThen === 0
        ? null
        : round(((costNow - costThen) / costThen) * 100),
    dearer,
    cheaper,
    impact,
    rateMoves: movedRates,
    frozenByLineRates: frozen,
  };
}

const round = (n: number): number => Math.round(n * 100) / 100;

import type { LibraryRow } from "./library";
import { FREE_LIMITS, type Plan, atFreeLimit } from "./org";

/**
 * The one thing to do next, while the book is still new.
 *
 * A new account used to land on a dashboard with nothing on it and no idea
 * what the six free dishes were for — "six dishes, free" is said on the
 * landing page, on the sign-in screen and on the plans page, and nowhere at
 * all inside the product. Somebody who signed up learned the limit by
 * reaching it, which is the worst moment to hear about it.
 *
 * This answers one question and not a tour: WHAT IS THE NEXT SINGLE THING.
 * Not a checklist, not a progress ring, not a modal to dismiss — one sentence
 * and one button, chosen from what is actually true of their book.
 *
 * ORDER IS THE DESIGN. A dish with a missing rate is not costed, so no figure
 * drawn from it means anything; that is fixed before a selling price is
 * asked for, and a selling price before a food-cost reading is offered. Each
 * state is only reachable when every earlier one is satisfied, so the screen
 * can never ask for the second thing while the first is still wrong.
 *
 * It returns null for a paid account. The limit is gone, the dashboard has a
 * sort order worth reading, and a nag would be all that was left.
 */

export type Start =
  /** Nothing costed. One sentence, one action. */
  | { readonly kind: "none" }
  /**
   * Dishes exist, but a rate is missing somewhere under them — so their cost
   * is a floor, not a cost, and every figure on top of it is a guess.
   */
  | {
      readonly kind: "unpriced";
      readonly costed: number;
      readonly stuck: number;
      readonly first: string;
      readonly firstId: string;
    }
  /** Costed, but nothing to compare against: no selling price. */
  | {
      readonly kind: "unsold";
      readonly costed: number;
      readonly without: number;
      readonly first: string;
      readonly firstId: string;
    }
  /**
   * The reward. At least one dish is costed and priced, so the product can
   * say something the owner did not already know.
   */
  | {
      readonly kind: "reading";
      readonly costed: number;
      /** The dish furthest from where they want it — the one worth looking at. */
      readonly dish: LibraryRow;
      /** Whether that dish spends more on suppliers than the target allows. */
      readonly over: boolean;
      /** Whether the free six are used up, which changes what comes next. */
      readonly atLimit: boolean;
    };

export interface StartInput {
  /** Every row the library knows. Batches are ignored for GUIDANCE only. */
  readonly rows: readonly LibraryRow[];
  /**
   * Every recipe, batches included — because that is what the cap counts.
   *
   * `atFreeLimit` compares against `recipes.length`, so a sub-recipe spends
   * one of the six. Filtering batches out here would have put a number beside
   * the org name that disagreed with the refusal at the door, which is the
   * one thing a counter must never do.
   */
  readonly recipeCount: number;
  readonly plan: Plan;
  /** The supplier share of every hundred the owner is aiming at (org.foodCostTarget). */
  readonly target: number;
}

export function startOf(input: StartInput): Start | null {
  // Bought and paid for. Nothing here is news any more.
  if (input.plan === "paid") return null;

  /*
   * Dishes only. A sub-recipe is not something anybody plates, and counting
   * the decoction as one of the six free dishes would be charging for the
   * working rather than the answer — the same line the free tier draws.
   */
  const dishes = input.rows.filter((r) => r.kind === "dish" && !r.archived);
  if (dishes.length === 0) return { kind: "none" };

  const stuck = dishes.filter((d) => !d.complete);
  const firstStuck = stuck[0];
  if (firstStuck !== undefined) {
    return {
      kind: "unpriced",
      costed: dishes.length - stuck.length,
      stuck: stuck.length,
      first: firstStuck.name,
      firstId: firstStuck.id,
    };
  }

  const unsold = dishes.filter((d) => d.sellingPrice === null);
  const firstUnsold = unsold[0];
  if (firstUnsold !== undefined) {
    return {
      kind: "unsold",
      costed: dishes.length,
      without: unsold.length,
      first: firstUnsold.name,
      firstId: firstUnsold.id,
    };
  }

  /*
   * The worst dish, by what it hands to suppliers. Not the best: a screen
   * that opens with the dish already doing well is a screen nobody acts on,
   * and the one furthest from target is the one worth the owner's minute.
   */
  const worst = dishes.reduce((a, b) =>
    (b.foodCostPercent ?? 0) > (a.foodCostPercent ?? 0) ? b : a,
  );

  return {
    kind: "reading",
    costed: dishes.length,
    dish: worst,
    over: (worst.foodCostPercent ?? 0) > input.target,
    // The real cap, counted the real way — never re-derived from dishes.
    atLimit: atFreeLimit(input.recipeCount, input.plan),
  };
}

/**
 * How much of the trial is spent.
 *
 * Takes the same count `atFreeLimit` takes — every recipe, batches included —
 * because a counter that disagrees with the cap is worse than no counter: it
 * tells somebody they have two left and then refuses the next one.
 *
 * A sub-recipe therefore spends one of the six. That is what the cap has
 * always done; it is a pricing decision and not this function's to soften.
 */
export function freeUsed(
  recipeCount: number,
  plan: Plan,
): { readonly used: number; readonly left: number; readonly limit: number } {
  const limit = FREE_LIMITS.recipes;
  if (plan === "paid") return { used: recipeCount, left: Infinity, limit };
  return { used: recipeCount, left: Math.max(0, limit - recipeCount), limit };
}

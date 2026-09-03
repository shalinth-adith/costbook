/**
 * How many dishes each ingredient reaches.
 *
 * The question behind it is the owner's, not the engine's: "if I go and argue
 * with the ghee supplier, how much of my menu is that?" An ingredient in
 * thirty-four dishes is a negotiation; one in a single chutney is not. The
 * same count decides which unpriced ingredient to ask about first — the one
 * that unblocks the most dishes — and which stale rate matters most.
 *
 * Reached, not merely listed: ghee inside the sambar counts for every dish
 * the sambar goes into, because a rate change in the ghee moves all of them.
 * That is the whole point of sub-recipes and it is why a flat count of
 * component lines would undercount the ingredients that matter most.
 *
 * Pure. `lib/store.ts` has the same walk bound to its memory state; this one
 * takes the recipes it is handed so it can be tested and used anywhere.
 */

import type { Recipe } from "@/core/recipe";

/** Ingredient id → how many top-level recipes reach it. */
export function usageOf(
  recipes: readonly Recipe[],
): ReadonlyMap<string, number> {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const counts = new Map<string, number>();

  /**
   * Every ingredient a recipe reaches, walking into sub-recipes. A set, so an
   * ingredient used twice in one dish — once directly and once through a
   * batch — counts that dish once. `seen` guards against a cycle; the engine
   * refuses cycles at write time, but a walk that would hang on one is a walk
   * that trusts the database more than it should.
   */
  const reached = (
    recipe: Recipe,
    seen: Set<string>,
    out: Set<string>,
  ): void => {
    if (seen.has(recipe.id)) return;
    seen.add(recipe.id);
    for (const c of recipe.components) {
      if (c.kind === "ingredient") out.add(c.ingredientId);
      else if (c.kind === "recipe") {
        const child = byId.get(c.childId);
        if (child !== undefined) reached(child, seen, out);
      }
    }
  };

  for (const recipe of recipes) {
    const out = new Set<string>();
    reached(recipe, new Set(), out);
    for (const id of out) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return counts;
}

/**
 * A pasted recipe, matched against what the kitchen already has.
 *
 * The step between "the chef pasted their recipe" and "the dish exists". Each
 * line is read by `core/loose.ts`, then looked for among the ingredients on
 * file and the recipes already costed — because a line reading "Sambar 200 g"
 * on a dosa is almost certainly the sambar this kitchen already makes, and
 * costing it as a new raw ingredient would break the link that makes a rate
 * change reach every dish above it.
 *
 * Nothing here writes. It produces what the screen shows and what the operator
 * confirms, and confirming is what writes.
 */

import type { Ingredient } from "@/core/ingredient";
import type { Recipe } from "@/core/recipe";
import { type LooseLine, parseLooseBlock } from "@/core/loose";

/** What a line turned out to be. */
export type Match =
  /** An ingredient already on the shelf. Its rate and yield come with it. */
  | { readonly kind: "ingredient"; readonly ingredient: Ingredient }
  /** A recipe this kitchen already makes. The link, not a copy. */
  | { readonly kind: "recipe"; readonly recipe: Recipe }
  /** Nothing on file by that name. It gets created, with no rate. */
  | { readonly kind: "new" };

export interface DraftLine {
  readonly line: LooseLine;
  readonly match: Match;
  /**
   * Whether this line can be costed as it stands.
   *
   * False when a quantity is missing, or when the thing it names is new and
   * therefore has no rate. Both are ordinary and neither blocks the dish —
   * a dish with a gap reports a floor and says so.
   */
  readonly ready: boolean;
}

export interface Draft {
  readonly lines: readonly DraftLine[];
  readonly matched: number;
  /** Lines pointing at a recipe already costed, which is the good case. */
  readonly linked: number;
  /** Ingredients that would be created. Named, so the count is never a surprise. */
  readonly created: readonly string[];
  /** Lines a person has to settle before the dish costs. */
  readonly needing: number;
}

/**
 * Names match on more than an exact string.
 *
 * A sheet says "Onion", the shelf says "Onions"; a sheet says "Sesame oil,
 * gingelly", the shelf says "Sesame oil". Neither is a typo and both are the
 * same thing, so the comparison drops case, punctuation and a trailing plural
 * before giving up. It does not go further than that — a fuzzy match that
 * links the wrong ingredient is a wrong rate on every dish that uses it, and
 * unlike a missing rate it never announces itself.
 */
export function matchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/s$/, "");
}

export interface DraftInput {
  readonly text: string;
  readonly shelf: readonly Ingredient[];
  readonly recipes: readonly Recipe[];
  /** The dish being created, so it cannot be a component of itself. */
  readonly excludeRecipeId?: string | undefined;
}

export function draftFrom(input: DraftInput): Draft {
  const byIngredient = new Map<string, Ingredient>();
  for (const i of input.shelf) byIngredient.set(matchKey(i.name), i);

  const byRecipe = new Map<string, Recipe>();
  for (const r of input.recipes) {
    if (r.id === input.excludeRecipeId) continue;
    byRecipe.set(matchKey(r.name), r);
  }

  const lines: DraftLine[] = parseLooseBlock(input.text).map((line) => {
    const key = matchKey(line.name);

    /*
     * A recipe wins a tie with an ingredient of the same name.
     *
     * A kitchen that makes its own sambar and also buys sambar powder will
     * have both, and the line on a dosa means the one they make. Costing it
     * as the bought ingredient would silently drop the sub-recipe link, and
     * with it every rate change that should have travelled up through it.
     */
    const recipe = key === "" ? undefined : byRecipe.get(key);
    if (recipe !== undefined) {
      return {
        line,
        match: { kind: "recipe", recipe },
        ready: line.qty !== null,
      };
    }

    const ingredient = key === "" ? undefined : byIngredient.get(key);
    if (ingredient !== undefined) {
      return {
        line,
        match: { kind: "ingredient", ingredient },
        // On the shelf but with no rate on file is still not costable. The
        // dish takes the line and reports a floor until a rate arrives.
        ready: line.qty !== null && ingredient.purchasePrice !== null,
      };
    }

    return { line, match: { kind: "new" }, ready: false };
  });

  return {
    lines,
    matched: lines.filter((l) => l.match.kind !== "new").length,
    linked: lines.filter((l) => l.match.kind === "recipe").length,
    created: lines
      .filter((l) => l.match.kind === "new" && l.line.name !== "")
      .map((l) => l.line.name),
    needing: lines.filter((l) => !l.ready).length,
  };
}

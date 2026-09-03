/**
 * Drift since a dish was priced.
 *
 * "Priced at 12 on 1 June, when it kept 70. Today it keeps 63: chicken is up
 * 14% and oil is up 9% since then." The first half is two stored figures; the
 * second is the rate history, filtered to the ingredients this dish reaches
 * and the days after the price was set. Nothing here is computed after the
 * fact from a guess at what the cost used to be.
 */

import type { Recipe } from '@/core/recipe';
import type { Ingredient } from '@/core/ingredient';
import type { RateChange } from '@/lib/org';

export interface RateDrift {
  readonly ingredientId: string;
  readonly name: string;
  /** From the last rate before pricing (or the first move's `from`) to today's. */
  readonly percent: number;
}

/** Every ingredient a recipe reaches, walking into the batches it uses. */
export function reachedBy(recipe: Recipe, others: readonly Recipe[]): ReadonlySet<string> {
  const byId = new Map(others.map((r) => [r.id, r]));
  const out = new Set<string>();
  const seen = new Set<string>();
  const walk = (r: Recipe): void => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    for (const c of r.components) {
      if (c.kind === 'ingredient') out.add(c.ingredientId);
      else if (c.kind === 'recipe') {
        const child = byId.get(c.childId);
        if (child !== undefined) walk(child);
      }
    }
  };
  walk(recipe);
  return out;
}

/**
 * The rates that moved after `pricedAt`, among those this dish reaches,
 * biggest move first. A confirmation (from = to) is not a move.
 */
export function driftSince(
  recipe: Recipe,
  others: readonly Recipe[],
  ingredients: readonly Ingredient[],
  history: Readonly<Record<string, readonly RateChange[]>>,
  pricedAt: string,
): readonly RateDrift[] {
  const reached = reachedBy(recipe, others);
  const named = new Map(ingredients.map((i) => [i.id, i.name]));
  const out: RateDrift[] = [];

  for (const id of reached) {
    const changes = (history[id] ?? []).filter((c) => c.on > pricedAt && c.from !== null && c.from !== c.to);
    if (changes.length === 0) continue;
    const ordered = [...changes].sort((a, b) => a.on.localeCompare(b.on));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (first === undefined || last === undefined || first.from === null || first.from === 0) continue;
    const name = named.get(id);
    if (name === undefined) continue;
    out.push({ ingredientId: id, name, percent: ((last.to - first.from) / first.from) * 100 });
  }

  return out.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));
}

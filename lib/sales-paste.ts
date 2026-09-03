/**
 * A month's sales, pasted.
 *
 * "Chicken 65, 412" on a line, or "Koottu 38", or two columns from a till
 * export. The name is matched to a dish loosely — case, spacing and the
 * tidying the recipe list already does — and a line that matches nothing is
 * handed back by name, never guessed at.
 */

import type { Recipe } from '@/core/recipe';
import { tidyDishName } from '@/core/parse';

export interface SalesLine {
  readonly raw: string;
  readonly name: string;
  readonly sold: number | null;
  /** The dish it matched, or null. */
  readonly recipeId: string | null;
}

const key = (s: string): string => tidyDishName(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function parseSales(text: string, recipes: readonly Recipe[]): readonly SalesLine[] {
  const byKey = new Map(recipes.map((r) => [key(r.name), r.id]));
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((raw) => {
      // The number is the last thing on the line; everything before it is the name.
      const m = /^(.*?)[\s,;\t]+(\d[\d,]*)\s*$/.exec(raw);
      if (m === null || m[1] === undefined || m[2] === undefined) {
        return { raw, name: raw, sold: null, recipeId: byKey.get(key(raw)) ?? null };
      }
      const name = m[1].replace(/[,;\t]+$/, '').trim();
      const sold = Number(m[2].replace(/,/g, ''));
      const split = byKey.get(key(name)) ?? null;
      // "Chicken 65" alone: the 65 is the dish, not a count. When the split
      // name matches nothing and the whole line does, the number belongs to
      // the name and there is no count on this line.
      if (split === null) {
        const whole = byKey.get(key(raw)) ?? null;
        if (whole !== null) return { raw, name: raw, sold: null, recipeId: whole };
      }
      return { raw, name, sold: Number.isFinite(sold) ? sold : null, recipeId: split };
    });
}

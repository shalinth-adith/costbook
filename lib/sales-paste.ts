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

/**
 * A till export, as a grid, turned into the lines the paste box takes.
 *
 * One reader for both doors. A file goes through the same parser as a paste
 * — the sheet is turned into "name<tab>count" lines and handed to
 * `parseSales` — so what the read-out says, what is matched and what is
 * named as unmatched cannot differ between the two.
 *
 * WHICH COLUMNS. The name is the first cell on a row that is not a number;
 * the count is the last cell that is. A header row — one with no number on
 * it at all — is skipped. Nothing is guessed from column headings, because
 * till exports do not agree on what to call anything.
 */
export function salesTextFromGrid(grid: readonly (readonly unknown[])[]): string {
  const isCount = (v: unknown): boolean =>
    typeof v === 'number' ? Number.isFinite(v) : /^\s*\d[\d,]*(\.\d+)?\s*$/.test(String(v ?? ''));

  const lines: string[] = [];
  for (const row of grid) {
    const cells = row.map((c) => (c === null || c === undefined ? '' : String(c).trim()));
    if (cells.every((c) => c === '')) continue;
    const countAt = cells.map(isCount).lastIndexOf(true);
    if (countAt === -1) continue; // a header, or a row with nothing to count
    const name = cells.find((c, i) => c !== '' && i !== countAt && !isCount(c));
    if (name === undefined) continue;
    const count = cells[countAt] ?? '';
    // Whole units only. A till that reports 12.0 sold is reporting 12.
    lines.push(`${name}\t${String(Math.round(Number(count.replace(/,/g, ''))))}`);
  }
  return lines.join('\n');
}

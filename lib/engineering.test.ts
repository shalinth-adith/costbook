/**
 * The four groups, and the lines that split them.
 */

import { describe, expect, it } from 'vitest';

import type { Recipe } from '@/core/recipe';

import { engineer, lastMonth, periodSaid } from './engineering';
import { parseSales } from './sales-paste';

const rows = [
  { id: 'c65', name: 'Chicken 65', sold: 412, price: 12, cost: 4 },      // leaves 8, high volume
  { id: 'koottu', name: 'Koottu', sold: 38, price: 2.6, cost: 0.77 },    // leaves 1.83, low volume
  { id: 'dosa', name: 'Masala Dosa', sold: 500, price: 4, cost: 2.8 },   // leaves 1.2, high volume
  { id: 'ghee', name: 'Ghee Roast', sold: 20, price: 30, cost: 9 },      // leaves 21, low volume
  { id: 'nopr', name: 'Unpriced', sold: 100, price: null, cost: 3 },
];

describe('engineer', () => {
  const e = engineer('2026-08-01', rows);
  it('leaves out a dish it cannot judge, rather than placing it by a guess', () => {
    expect(e?.dishes.some((d) => d.id === 'nopr')).toBe(false);
  });
  it('splits the menu into four by volume and money left', () => {
    const g = e?.groups;
    expect(g?.push.map((d) => d.id)).toEqual(['c65']);
    expect(g?.sells_leaves_little.map((d) => d.id)).toEqual(['dosa']);
    expect(g?.leaves_sells_poorly.map((d) => d.id)).toEqual(['ghee']);
    expect(g?.neither.map((d) => d.id)).toEqual(['koottu']);
  });
  it('ranks by what each dish left in the month', () => {
    expect(e?.dishes[0]?.id).toBe('c65');
    expect(e?.dishes[0]?.leftTotal).toBeCloseTo(3296, 6);
  });
  it('needs at least two dishes to draw a line through', () => {
    expect(engineer('2026-08-01', rows.slice(0, 1))).toBeNull();
  });
});

describe('periods', () => {
  it('names last month and says it in words', () => {
    expect(lastMonth('2026-09-04')).toBe('2026-08-01');
    expect(lastMonth('2026-01-15')).toBe('2025-12-01');
    expect(periodSaid('2026-08-01')).toBe('August 2026');
  });
});

describe('parseSales', () => {
  const recipes = [
    { id: 'c65', name: 'Chicken 65' },
    { id: 'koottu', name: 'Koottu' },
  ] as unknown as Recipe[];
  it('reads a name and a number a line, in any common shape', () => {
    const out = parseSales('Chicken 65, 412\nkoottu\t38\nKoottu 1,200', recipes);
    expect(out.map((l) => [l.recipeId, l.sold])).toEqual([['c65', 412], ['koottu', 38], ['koottu', 1200]]);
  });
  it('hands back a line it cannot match, by name, with no guess', () => {
    const out = parseSales('Podi Idly 90', recipes);
    expect(out[0]?.recipeId).toBeNull();
    expect(out[0]?.name).toBe('Podi Idly');
    expect(out[0]?.sold).toBe(90);
  });
  it('keeps a trailing number that is part of the name when there is no count', () => {
    // "Chicken 65" alone: the 65 is the dish, not a count — and there is no count.
    const out = parseSales('Chicken 65', recipes);
    expect(out[0]?.recipeId).toBe('c65');
  });
});

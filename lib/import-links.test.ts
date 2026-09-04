/**
 * Two things a real sheet does that its values alone do not show: a line
 * added per item, and a line that is another recipe on the same sheet.
 */

import { describe, expect, it } from 'vitest';

import { parseRows } from '@/core/parse';

import { planImport } from './import';

const H = ['Menu Section', 'Recipe Name', 'Ingredient', 'Quantity', 'Unit', 'Unit Rate', 'Price', 'Output (KG)', 'Output (NO)', 'Cost per Item', 'Expected SP'];
const rows = [
  ['KUMBAKONAM CAFE'],
  H,
  ['Breakfast', '1.1 Dosa Batter', 'Idly Rice', '8', 'kg', '3.16', '25.28', '9.65', '125', '1.99', '9.98'],
  ['', '', 'Urad Dal', '1.6', 'kg', '6.6', '10.56'],
  ['', '', 'Ghee', '0.05', 'l', '34', '1.70'],
  ['Dinner', '9.3 Paniyaram', 'Dosa Batter', '2', 'kg', '', '', '', '56', '', ''],
  ['', '', 'Oil', '0.1', 'l', '5', '0.5'],
];

describe('a line the sheet adds per item', () => {
  it('is scoped to the portion when the formula says so', () => {
    // Row 4 (zero-based) is the ghee line; the sheet's J3 formula adds it per item.
    const parsed = parseRows(rows, { perPortionRows: [4] });
    const batter = parsed.blocks[0];
    expect(batter?.lines.map((l) => [l.name, l.scope])).toEqual([
      ['Idly Rice', 'batch'],
      ['Urad Dal', 'batch'],
      ['Ghee', 'portion'],
    ]);
    const plan = planImport(parsed, [], '2026-09-05');
    const ghee = plan.recipes[0]?.recipe.components.find((c) => c.kind === 'ingredient' && c.scope === 'portion');
    expect(ghee).toBeDefined();
  });
});

describe('a line that is another recipe on the sheet', () => {
  it('links to it instead of becoming an ingredient with a typed rate', () => {
    const plan = planImport(parseRows(rows, {}), [], '2026-09-05');
    const paniyaram = plan.recipes.find((r) => r.recipe.name.includes('Paniyaram'));
    const link = paniyaram?.recipe.components.find((c) => c.kind === 'recipe');
    expect(link?.kind).toBe('recipe');
    expect(link && 'childId' in link ? link.childId : null).toBe(plan.recipes[0]?.recipe.id);
    expect(paniyaram?.linked).toBe(1);
    expect(plan.ingredients.some((i) => i.ingredient.name.toLowerCase() === 'dosa batter')).toBe(false);
  });
  it('plans the child before the parent, whatever the sheet’s order', () => {
    const reordered = [rows[0]!, rows[1]!, rows[5]!, rows[6]!, rows[2]!, rows[3]!, rows[4]!];
    const plan = planImport(parseRows(reordered, {}), [], '2026-09-05');
    expect(plan.recipes[0]?.recipe.name).toContain('Dosa Batter');
    expect(plan.recipes[1]?.recipe.components.some((c) => c.kind === 'recipe')).toBe(true);
  });
  it('links to a recipe already in the book', () => {
    const only = [rows[0]!, rows[1]!, rows[5]!, rows[6]!];
    const known = { id: 'dosa-batter', name: 'Dosa Batter', family: 'mass', outputQty: 9650, outputUnit: 'kg', portions: 125, components: [] } as never;
    const plan = planImport(parseRows(only, {}), [], '2026-09-05', [known]);
    expect(plan.recipes[0]?.recipe.components.some((c) => c.kind === 'recipe' && c.childId === 'dosa-batter')).toBe(true);
  });
});

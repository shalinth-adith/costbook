import { describe, expect, it } from 'vitest';

import { parseRows } from '@/core/parse';
import { recipeCost, pantryOf, isComplete } from '@/core/recipe';

import { shelf } from './data';
import { groupWarnings, planImport } from './import';

/**
 * A real sheet, of the shape the reference workbook has: a title above the
 * header, blocks separated by totals rows, units that lie, words that are not
 * units, and a rate derived from a spend.
 */
const SHEET: readonly (readonly string[])[] = [
  ['Sri Krishna Cafe - recipe costing', '', '', '', ''],
  ['', '', '', '', ''],
  ['ITEM DESCRIPTION', 'QTY', 'UOM', 'RATE', 'AMOUNT'],
  ['Kaima Idly', '', '', '', ''],
  ['Idly rice', '600', 'g', '0.052', '31.20'],
  ['Onion, big', '150', 'gm', '0.040', '6.00'],
  ['Curry leaves', '8', 'g', '', '2.68'],
  ['Blending', '1', 'lot', '25', '25.00'],
  ['Total', '', '', '', '64.88'],
  ['', '', '', '', ''],
  ['Rava Dosa', '', '', '', ''],
  ['Rava', '400', 'g', '0.062', '24.80'],
  ['Refined oil', '80', 'ml', '0.148', '11.84'],
  ['Kasoori methi', '4', 'g', '', ''],
  ['Total', '', '', '', '36.64'],
];

const TODAY = '2026-08-29';
const parsed = parseRows(SHEET, { knownRecipes: [] });
const plan = planImport(parsed, shelf, TODAY);

describe('a spreadsheet becomes a costed menu', () => {
  it('finds the recipes in it', () => {
    expect(plan.recipes.map((r) => r.recipe.name)).toEqual(['Kaima Idly', 'Rava Dosa']);
  });

  it('creates an ingredient for every line that names one', () => {
    const names = plan.ingredients.map((p) => p.ingredient.name);
    expect(names).toContain('Idly rice');
    expect(names).toContain('Rava');
    expect(names).toContain('Kasoori methi');
  });

  it('builds components that actually cost', () => {
    const first = plan.recipes[0];
    if (first === undefined) throw new Error('no recipe');

    const pantry = pantryOf(
      plan.recipes.map((r) => r.recipe),
      plan.ingredients.map((p) => p.ingredient),
    );
    const cost = recipeCost(first.recipe, pantry);
    if (!isComplete(cost)) throw new Error('should be costed');

    // 600 x 0.052 + 150 x 0.040 + 8 x (2.68/8) + 25 flat
    expect(cost.batch).toBeCloseTo(31.2 + 6 + 2.68 + 25, 6);
  });

  it('derives a rate from a spend where the sheet gives one', () => {
    // Curry leaves has no rate column, only a total. 2.68 over 8 g.
    const leaves = plan.ingredients.find((p) => p.ingredient.name === 'Curry leaves');
    expect(leaves?.ingredient.purchasePrice).toBeCloseTo(2.68 / 8, 8);
  });

  it('never invents a rate for a row that has none', () => {
    const methi = plan.ingredients.find((p) => p.ingredient.name === 'Kasoori methi');
    expect(methi?.ingredient.purchasePrice).toBeNull();
    expect(methi?.ingredient.pricedAt).toBeUndefined();
  });

  it('turns a word that is not a unit into a cost with a label', () => {
    const first = plan.recipes[0];
    const flat = first?.recipe.components.find((c) => c.kind === 'flat');
    expect(flat).toBeDefined();
  });

  it('matches an ingredient already on file rather than making a second', () => {
    const onion = plan.ingredients.find((p) => p.ingredient.name === 'Onion, big');
    expect(onion?.existing).toBe(true);
    expect(onion?.wasRate).not.toBeNull();
  });

  it('never states a batch size the sheet did not give', () => {
    // The reference workbook infers output from its inputs and gets it wrong
    // three ways. One portion until the operator says otherwise (TRD 6.3).
    for (const r of plan.recipes) expect(r.recipe.portions).toBe(1);
  });

  it('counts what committing would do', () => {
    expect(plan.summary.dishes).toBe(2);
    expect(plan.summary.ingredientsNew).toBeGreaterThan(0);
    expect(plan.summary.ratesUpdated).toBeGreaterThan(0);
  });
});

describe('the warnings, ranked and calm', () => {
  const groups = groupWarnings(parsed);

  it('groups by kind rather than listing every row', () => {
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) expect(g.items.length).toBeGreaterThan(0);
  });

  it('sorts by consequence, not by row order', () => {
    const rank = { block: 0, flag: 1, review: 2 } as const;
    const order = groups.map((g) => rank[g.tone]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('reads as work to do rather than errors made', () => {
    for (const g of groups) {
      expect(g.body).not.toMatch(/error|invalid|failed|wrong with/i);
      expect(g.body.length).toBeGreaterThan(40);
    }
  });

  it('says an unpriced row still arrives', () => {
    const noRate = groups.find((g) => g.code === 'no_rate');
    expect(noRate?.body).toContain('floor');
  });
});

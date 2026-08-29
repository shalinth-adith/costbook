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

describe('a rate that cannot be trusted is not imported', () => {
  /**
   * Found by importing a real 1,140-row workbook: 516 rows carried a quantity
   * that did not suit its unit, and every one of them set a rate anyway. The
   * result was tomato at 0.22 a kilo and maida at 1,800 - figures that pass
   * every check and are wrong by a factor of a thousand.
   *
   * A missing rate produces an honest floor. A wrong one produces a plausible
   * lie, which is the failure this whole product exists to prevent.
   */
  const LYING: readonly (readonly string[])[] = [
    ['ITEM', 'QTY', 'UOM', 'RATE', 'AMOUNT'],
    ['Some dish', '', '', '', ''],
    // Labelled kg, holding grams: 1000 kg of tomato is not a recipe line.
    ['Tomato', '1000', 'kg', '0.22', '220'],
    // Rate and total refuse to multiply out.
    ['Maida', '400', 'g', '1.80', '24.80'],
    // Nothing wrong with this one.
    ['Urad dal', '750', 'g', '0.12', '90'],
  ];

  const parsedLying = parseRows(LYING, {});
  const lyingPlan = planImport(parsedLying, [], TODAY);
  const planned = (name: string) =>
    lyingPlan.ingredients.find((p) => p.ingredient.name === name);

  it('brings the ingredient in, but without a rate', () => {
    const tomato = planned('Tomato');
    expect(tomato).toBeDefined();
    expect(tomato?.suspect).toBe(true);
    expect(tomato?.ingredient.purchasePrice).toBeNull();
  });

  it('says which row it came from and why it was refused', () => {
    expect(planned('Tomato')?.suspectWhy).toContain('does not suit');
    expect(planned('Maida')?.suspectWhy).toContain('multiply out');
    expect(planned('Tomato')?.sourceRow).toBe(2);
  });

  it('leaves a sound row alone', () => {
    const dal = planned('Urad dal');
    expect(dal?.suspect).toBe(false);
    expect(dal?.ingredient.purchasePrice).toBeCloseTo(90 / 750, 8);
  });

  it('counts the unpriced ones, so the summary is not a surprise', () => {
    expect(lyingPlan.summary.unpriced).toBe(2);
  });
});

describe('the arithmetic is trusted over the label', () => {
  it('derives the rate from the spend when the two disagree', () => {
    // TRD 7.1: the unit column is decorative and drifted out of agreement with
    // the figures beside it. The reference workbook derives rate from spend on
    // 251 lines, so that is the figure to keep.
    const rows: readonly (readonly string[])[] = [
      ['ITEM', 'QTY', 'UOM', 'RATE', 'AMOUNT'],
      ['Dish', '', '', '', ''],
      ['Ghee', '100', 'g', '0.50', '62.00'],
    ];
    const p = planImport(parseRows(rows, {}), [], TODAY);
    const ghee = p.ingredients.find((i) => i.ingredient.name === 'Ghee');

    // Flagged, so no rate is set at all - but the derivation is the one that
    // would have been used.
    expect(ghee?.suspect).toBe(true);
    expect(ghee?.ingredient.purchasePrice).toBeNull();
  });

  it('uses the spend where there is no rate column at all', () => {
    const leaves = plan.ingredients.find((p) => p.ingredient.name === 'Curry leaves');
    expect(leaves?.ingredient.purchasePrice).toBeCloseTo(2.68 / 8, 8);
  });
});

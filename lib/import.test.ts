import { describe, expect, it } from 'vitest';

import { missingFields, parseRows, readRow, sampleRows } from '@/core/parse';
import { recipeCost, pantryOf, isComplete } from '@/core/recipe';

import { shelf } from './data';
import { groupWarnings, looksLikeMappingError, planImport } from './import';

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

    // 600 x 0.052 + 150 x 0.040 / 0.88 + 8 x (2.68/8) + 25 flat.
    // Onion is already on file with a yield of 88, and an import keeps what
    // the owner set about a thing they already have; only the rate moves.
    // It used to rebuild the onion from the row, yield back to 100.
    expect(cost.batch).toBeCloseTo(31.2 + 6 / 0.88 + 2.68 + 25, 6);
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

describe('a sheet that names the recipe on every row', () => {
  /**
   * Reported from a real 1,140-row workbook that produced six dishes. Guessing
   * blocks from blank rows works on a sheet laid out in blocks and produces
   * almost nothing on one that is not - and a menu of that size never has six
   * dishes in it (A7b). Where the sheet names the recipe, that column is the
   * grouping and nothing has to be inferred.
   */
  const FLAT: readonly (readonly string[])[] = [
    ['RECIPE', 'INGREDIENT', 'QTY', 'UOM', 'UNIT RATE'],
    ['Kaima Idly', 'Idly rice', '600', 'g', '0.052'],
    ['Kaima Idly', 'Onion, big', '150', 'g', '0.040'],
    ['Rava Dosa', 'Rava', '400', 'g', '0.062'],
    ['Rava Dosa', 'Refined oil', '80', 'ml', '0.148'],
    ['Kaima Idly', 'Curry leaves', '8', 'g', '0.335'],
  ];

  const p = parseRows(FLAT, {});

  it('maps the recipe column without being told', () => {
    expect(p.mapping.recipe).toBe(0);
    expect(p.mapping.name).toBe(1);
  });

  it('groups every row by the recipe it names, wherever the row sits', () => {
    // The third Kaima Idly line is at the bottom, after a Rava Dosa row.
    expect(p.blocks.map((b) => b.name).sort()).toEqual(['Kaima Idly', 'Rava Dosa']);
    const kaima = p.blocks.find((b) => b.name === 'Kaima Idly');
    expect(kaima?.lines).toHaveLength(3);
  });

  it('makes a dish of each, rather than one heap of ingredients', () => {
    const planned = planImport(p, [], TODAY);
    expect(planned.summary.dishes).toBe(2);
  });
});

describe('when the warnings are about the mapping, not the sheet', () => {
  /**
   * A quarter of the rows in one group is not a scattering of bad cells, it is
   * one wrong decision made once (A7b).
   */
  const WRONG: readonly (readonly string[])[] = [
    ['RECIPE', 'INGREDIENT', 'QTY', 'UOM', 'RATE'],
    ...Array.from({ length: 10 }, (_, i) => [
      'A dish', `Thing ${i}`, '1000', 'kg', '2',
    ]),
  ];

  it('names the likely cause and marks the group as blocking', () => {
    const groups = groupWarnings(parseRows(WRONG, {}), 10);
    const fault = looksLikeMappingError(groups);

    expect(fault).not.toBeNull();
    expect(fault?.tone).toBe('block');
    expect(fault?.share).toBeGreaterThanOrEqual(0.25);
    expect(fault?.body).toContain('mapped to the wrong field');
  });

  it('leaves an ordinary scattering alone', () => {
    // The sheet from the tests above carries a few of everything and none of
    // them dominate, so nothing is escalated.
    expect(looksLikeMappingError(groupWarnings(parsed, 20))).toBeNull();
  });

  it('never escalates a decision about one column, however many rows it touches', () => {
    const groups = groupWarnings(parseRows(WRONG, {}), 10);
    const unmapped = groups.find((g) => g.code === 'unmapped_columns');
    expect(unmapped?.likelyMapping ?? false).toBe(false);
  });
});

describe('reading one row back as a sentence', () => {
  const ROWS: readonly (readonly string[])[] = [
    ['RECIPE', 'INGREDIENT', 'QTY', 'UOM', 'UNIT RATE', 'TOTAL'],
    ['Kaima Idly', 'Idly Rice', '8', 'kg', '25.28', '202.24'],
    ['Kaima Idly', 'Ghee', '15', 'g', '0.62', '9.30'],
  ];
  const mapped = parseRows(ROWS, {}).mapping;

  it('agrees with the sheet when the mapping is right', () => {
    const r = readRow(ROWS, 1, mapped);
    expect(r?.name).toBe('Idly Rice');
    expect(r?.lineTotal).toBeCloseTo(202.24, 6);
    expect(r?.agrees).toBe(true);
  });

  it('refuses to agree when rate and total are the wrong way round', () => {
    // Swapping both columns squares the error - 8 x 202.24 read against a
    // total of 25.28 - so the factor is 64 rather than 8. What matters is that
    // it does not agree and says how far out it is.
    const { rate, total, ...rest } = mapped;
    if (rate === undefined || total === undefined) throw new Error('both columns are mapped');
    const r = readRow(ROWS, 1, { ...rest, rate: total, total: rate });

    expect(r?.agrees).toBe(false);
    expect(Math.abs(r?.factor ?? 0)).toBeGreaterThan(2);
  });

  it('is off by the quantity when a money column is read as a rate', () => {
    // A7b's own case: the column holds the line total, 25.28 for 8 kg, and
    // reading it as a per-unit rate gives 202.24 - eight times too much.
    const AS_RATE: readonly (readonly string[])[] = [
      ['RECIPE', 'INGREDIENT', 'QTY', 'UOM', 'AMOUNT', 'CHECK'],
      ['Kaima Idly', 'Idly Rice', '8', 'kg', '25.28', '25.28'],
    ];
    const r = readRow(AS_RATE, 1, { recipe: 0, name: 1, qty: 2, unit: 3, rate: 4, total: 5 });

    expect(r?.lineTotal).toBeCloseTo(202.24, 6);
    expect(r?.agrees).toBe(false);
    expect(Math.abs(r?.factor ?? 0)).toBeCloseTo(8, 2);
  });

  it('says which recipe a row belongs to, so an unmapped one is visible', () => {
    expect(readRow(ROWS, 1, mapped)?.recipe).toBe('Kaima Idly');
    const { recipe: _dropped, ...withoutRecipe } = mapped;
    expect(readRow(ROWS, 1, withoutRecipe)?.recipe).toBeNull();
  });

  it('lists what a sheet still has to place', () => {
    expect(missingFields({})).toContain('recipe');
    expect(missingFields(mapped)).toHaveLength(0);
  });

  it('steps through a spread of rows, not just the first', () => {
    // One row hides a unit problem: rice by the kilo and ghee by the gram fail
    // differently (A6).
    const picked = sampleRows(ROWS, mapped, 0);
    expect(picked.length).toBeGreaterThan(1);
  });
});

describe('a sheet whose recipe name is a merged cell', () => {
  /**
   * The shape a real Kumbakonam sheet has: section and recipe merged down the
   * page, so each name appears once and every row under it is blank. Seven
   * ingredients make a coconut chutney and only the first one sits beside the
   * name.
   *
   * Read literally, a blank grouping cell means "no recipe" and six of the
   * seven lines are thrown away - which is how a 1,140-row workbook produced
   * six dishes made of one ingredient each. A blank there means "the same one
   * as above" (TRD 7).
   */
  const MERGED: readonly (readonly string[])[] = [
    ['SECTION', 'RECIPE', 'INGREDIENT', 'QTY', 'UOM', 'UNIT RATE'],
    ['Breakfast - Chutneys', '5.1 Coconut Chutney', 'Coconut', '1', 'kg', '190'],
    ['', '', 'Roasted Gram Dal', '100', 'g', '0.16'],
    ['', '', 'Ginger', '20', 'g', '0.24'],
    ['', '', 'Green Chilli', '25', 'g', '0.18'],
    ['', '', 'Garlic', '15', 'g', '0.30'],
    ['', '', 'Salt', '10', 'g', '0.022'],
    ['', '', 'Water', '200', 'ml', '0'],
    ['', '5.2 Mint Chutney', 'Coriander leaves', '150', 'g', '0.28'],
    ['', '', 'Mint leaves', '100', 'g', '0.24'],
    ['', '', 'Green Chilli', '30', 'g', '0.18'],
  ];

  const p = parseRows(MERGED, {});

  it('finds both recipes, not ten loose ingredients', () => {
    // The sheet's own block index does not survive into the name. It belongs
    // to the sheet's layout, not to the dish, and it repeats across sheets —
    // see `tidyDishName`. The cell still reads "5.1 Coconut Chutney".
    expect(p.blocks.map((b) => b.name)).toEqual(['Coconut Chutney', 'Mint Chutney']);
  });

  it('keeps every ingredient under the name it belongs to', () => {
    const chutney = p.blocks.find((b) => b.name === 'Coconut Chutney');
    expect(chutney?.lines.map((l) => l.name)).toEqual([
      'Coconut',
      'Roasted Gram Dal',
      'Ginger',
      'Green Chilli',
      'Garlic',
      'Salt',
      'Water',
    ]);
  });

  it('starts the next recipe where the sheet names one', () => {
    const mint = p.blocks.find((b) => b.name === 'Mint Chutney');
    expect(mint?.lines).toHaveLength(3);
    // Nothing leaks backwards from the chutney above it.
    expect(mint?.lines.map((l) => l.name)).not.toContain('Coconut');
  });

  it('carries the section down the same way', () => {
    // Both recipes belong to Breakfast - Chutneys, which is written once.
    expect(p.mapping.section).toBe(0);
  });

  it('makes a dish of each, with all of its lines', () => {
    const planned = planImport(p, [], TODAY);
    expect(planned.summary.dishes).toBe(2);

    const chutney = planned.recipes.find((r) => r.recipe.name === 'Coconut Chutney');
    expect(chutney?.recipe.components).toHaveLength(7);
  });

  it('does not carry a name across a genuinely blank row', () => {
    // A blank row ends the run, so the next value starts fresh rather than
    // inheriting from far above it.
    const withGap: readonly (readonly string[])[] = [
      ['SECTION', 'RECIPE', 'INGREDIENT', 'QTY', 'UOM', 'UNIT RATE'],
      ['Breakfast', 'Idly', 'Idly rice', '600', 'g', '0.052'],
      ['', '', '', '', '', ''],
      ['', '', 'Stray note', '1', 'g', '1'],
    ];
    const gapped = parseRows(withGap, {});
    expect(gapped.blocks).toHaveLength(1);
    expect(gapped.blocks[0]?.lines.map((l) => l.name)).toEqual(['Idly rice']);
  });
});

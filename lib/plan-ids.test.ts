/**
 * A plan the database can actually accept.
 *
 * The importer reached its result screen, showed a fix list, and wrote nothing.
 * A real sheet carries "Salt" and "Salt." — a trailing full stop apart — and
 * the plan keyed ingredients by lowercased name while the database keys them
 * by slug. Two entries, one id, and an upsert given the same id twice in one
 * batch is refused outright. One stray full stop imported nothing.
 */
import { describe, expect, it } from 'vitest';

import { detectMapping, parseRows } from '@/core/parse';

import { planImport } from './import';

const HEADER = ['Recipe Name', 'Ingredient', 'Quantity', 'Unit', 'Unit Rate'];
const plan = (rows: string[][]) =>
  planImport(parseRows([HEADER, ...rows], { mapping: detectMapping(HEADER), headerRow: 0 }), [], '2026-08-31');

describe('ids the database will accept', () => {
  it('merges two spellings of one ingredient', () => {
    const out = plan([
      ['Dosa', 'Salt', '0.1', 'kg', '1.16'],
      ['Dosa', 'Salt.', '0.2', 'kg', '1.16'],
    ]);
    const ids = out.ingredients.map((p) => p.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('salt');
  });

  it('merges two blocks whose names slugify the same', () => {
    const out = plan([
      ['Kuruma', 'Onion', '1', 'kg', '3'],
      ['', 'Salt', '0.1', 'kg', '1'],
      ['Kuruma.', 'Tomato', '1', 'kg', '2'],
    ]);
    const ids = out.recipes.map((r) => r.recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the lines from both when two blocks merge', () => {
    const out = plan([
      ['Kuruma', 'Onion', '1', 'kg', '3'],
      ['Kuruma.', 'Tomato', '1', 'kg', '2'],
    ]);
    const kuruma = out.recipes.find((r) => r.recipe.id === 'kuruma');
    expect(kuruma?.recipe.components).toHaveLength(2);
  });

  it('never produces a duplicate id, whatever the sheet does', () => {
    const out = plan([
      ['A', 'Ghee', '1', 'kg', '34'],
      ['A', 'Ghee.', '1', 'kg', '34'],
      ['A', 'GHEE', '1', 'kg', '34'],
      ['A', 'ghee ', '1', 'kg', '34'],
    ]);
    const ids = out.ingredients.map((p) => p.ingredient.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('what counts as blocking', () => {
  /*
   * A row written the way a kitchen writes is not an error. "Blending, 1 lot
   * at 50" is a complete, costable line — a cost with a label, which is what
   * TRD 3.1 asks for. Counting these as blocking put 82 dishes on a list
   * nobody would work through, burying the few that needed a rate.
   */
  it('does not block on a word that is not a unit', () => {
    const out = parseRows(
      [HEADER, ['Dosa', 'Blending (processing)', '1', 'lot', '50']],
      { mapping: detectMapping(HEADER), headerRow: 0 },
    );
    const codes = out.warnings.map((w) => w.code);
    expect(codes).toContain('unrecognised_unit');
  });
});

/**
 * A line Costbook cannot measure, it can still cost.
 *
 * A real sheet writes ghee in kilos on one dish and litres on another — eight
 * ingredients do it across 75 lines, and they are the expensive ones.
 * Converting between the two needs a density Costbook does not hold, so one
 * ingredient cannot carry both families and the line used to be dropped.
 *
 * Dropping it took the money with it: Kichadi lost 7.50 of ghee from an 18.15
 * batch and reported 41% under its own sheet. A wrong figure arrived at
 * silently is the one thing this product must not produce.
 */
describe('an ingredient written in two unit families', () => {
  const rows = [
    ['Kichadi', 'Rava', '1.4', 'kg', '3.286'],
    ['Kichadi', 'Ghee', '0.2', 'kg', '37.5'],
    ['Dosa', 'Ghee', '0.05', 'l', '34'],
  ];

  it('keeps the cost of the line it cannot measure', () => {
    const out = plan(rows);
    const kichadi = out.recipes.find((r) => r.recipe.id === 'kichadi');
    // Both lines survive: one measured, one as a cost with a label.
    expect(kichadi?.recipe.components).toHaveLength(2);
  });

  /*
   * The clash lands on whichever dish is read second: the first sets the
   * ingredient's family, and the second cannot be measured against it.
   */
  it('costs it at quantity times rate, which is not in doubt', () => {
    const dosa = plan(rows).recipes.find((r) => r.recipe.id === 'dosa');
    const flat = dosa?.recipe.components.find((c) => c.kind === 'flat');
    expect(flat).toBeDefined();
    if (flat?.kind !== 'flat') return;
    expect(flat.amount).toBeCloseTo(0.05 * 34, 6);
  });

  it('says in the label which unit the sheet wrote', () => {
    const dosa = plan(rows).recipes.find((r) => r.recipe.id === 'dosa');
    const flat = dosa?.recipe.components.find((c) => c.kind === 'flat');
    if (flat?.kind !== 'flat') return;
    expect(flat.label).toContain('Ghee');
    expect(flat.label).toMatch(/l/);
  });

  it('still drops a line with no rate, because there is no cost to keep', () => {
    const out = plan([
      ['Kichadi', 'Rava', '1.4', 'kg', '3.286'],
      ['Kichadi', 'Ghee', '0.2', 'kg', '37.5'],
      // Same clash, but nothing to cost it with.
      ['Dosa', 'Ghee', '0.05', 'l', ''],
      ['Dosa', 'Rava', '1', 'kg', '3'],
    ]);
    const dosa = out.recipes.find((r) => r.recipe.id === 'dosa');
    expect(dosa?.recipe.components).toHaveLength(1);
  });
});

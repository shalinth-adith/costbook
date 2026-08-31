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

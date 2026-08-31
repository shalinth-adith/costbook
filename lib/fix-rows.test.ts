/**
 * A warning you can act on where it is shown.
 *
 * The review screen counted problems and offered nothing to do about them, so
 * the only way to fix a row was to re-open the spreadsheet, find it, correct
 * it, export, and upload again. For 115 flagged rows on a real sheet that is
 * not a workflow, it is a reason to stop using the product.
 *
 * Nothing here touches the file. Costbook only ever reads it.
 */
import { describe, expect, it } from 'vitest';

import { detectMapping, parseRows } from '@/core/parse';

import { flaggedRows } from './import';

const HEADER = ['Recipe Name', 'Ingredient', 'Quantity', 'Unit', 'Unit Rate', 'Price (AED)'];
const SHEET = [
  HEADER,
  ['Dosa Batter', 'Idly Rice', '8', 'kg', '3.16', '25.28'],
  // Its rate and its total refuse to multiply out.
  ['', 'Ice cube', '3', 'kg', '1.833', '6'],
  // No quantity at all.
  ['', 'Water', '', 'l', '', ''],
  // A word that is not a unit.
  ['', 'Salt', '1', 'as req', '', ''],
];

const mapping = detectMapping(HEADER);
const parse = (rowEdits = {}) => parseRows(SHEET, { mapping, headerRow: 0, rowEdits });

describe('gathering what to fix', () => {
  it('names the rows a warning is actually about', () => {
    const flagged = flaggedRows(parse());
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.map((f) => f.name)).toContain('Ice cube');
  });

  it('carries each row’s own figures, so it can be corrected in place', () => {
    const ice = flaggedRows(parse()).find((f) => f.name === 'Ice cube');
    expect(ice).toMatchObject({ qty: 3, unit: 'kg', rate: 1.833, total: 6 });
  });

  it('puts the rows that stop a dish being costed first', () => {
    const flagged = flaggedRows(parse());
    const firstMild = flagged.findIndex((f) => f.severity === 'worth-a-look');
    if (firstMild === -1) return;
    expect(flagged.slice(firstMild).some((f) => f.severity === 'stops-costing')).toBe(false);
  });

  it('says why, in the operator’s words rather than a code', () => {
    for (const f of flaggedRows(parse())) {
      expect(f.why.length).toBeGreaterThan(10);
      expect(f.why).not.toMatch(/_/);
    }
  });
});

describe('correcting a row', () => {
  it('takes the typed quantity, unit and rate over the sheet’s', () => {
    const out = parse({ 2: { qty: '0.5', unit: 'kg', rate: '9' } });
    const line = out.blocks.flatMap((b) => b.lines).find((l) => l.row === 2);
    expect(line).toMatchObject({ qty: 0.5, unit: 'kg', rate: 9 });
  });

  it('takes a corrected name', () => {
    const out = parse({ 2: { name: 'Ice cubes' } });
    expect(out.blocks.flatMap((b) => b.lines).some((l) => l.name === 'Ice cubes')).toBe(true);
  });

  it('clears the warning once the figures agree', () => {
    const before = flaggedRows(parse()).some((f) => f.name === 'Ice cube');
    // 3 x 2 = 6, which is what the sheet's own total says.
    const after = flaggedRows(parse({ 2: { rate: '2' } })).some((f) => f.name === 'Ice cube');
    expect(before).toBe(true);
    expect(after).toBe(false);
  });

  it('leaves a struck-out row out entirely', () => {
    const n = parse().blocks.flatMap((b) => b.lines).length;
    const out = parse({ 2: { drop: true } });
    expect(out.blocks.flatMap((b) => b.lines)).toHaveLength(n - 1);
  });

  it('puts it back when the operator changes their mind', () => {
    const n = parse().blocks.flatMap((b) => b.lines).length;
    expect(parse({ 2: { drop: false } }).blocks.flatMap((b) => b.lines)).toHaveLength(n);
  });

  it('changes nothing on rows that were not touched', () => {
    const before = parse().blocks.flatMap((b) => b.lines).find((l) => l.name === 'Idly Rice');
    const after = parse({ 2: { qty: '99' } }).blocks.flatMap((b) => b.lines).find((l) => l.name === 'Idly Rice');
    expect(after).toEqual(before);
  });
});

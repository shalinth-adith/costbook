/**
 * Columns Costbook does not cost are kept, under the operator's own headings.
 *
 * PRD 6 promises unmapped columns are kept rather than discarded. It was a
 * warning and nothing else — the sheet's other third was read, counted, and
 * thrown away.
 */
import { describe, expect, it } from 'vitest';

import { detectMapping, parseRows } from './parse';

const HEADER = ['Recipe Name', 'Ingredient', 'Quantity', 'Unit', 'Unit Rate', 'Cost per Item', 'Shelf Life'];
const ROWS = [
  HEADER,
  ['Dosa Batter', 'Idly Rice', '8', 'kg', '3.16', '9.978', '3 days'],
  ['', 'Urudh Dhal', '1.6', 'kg', '6.60', '', ''],
];

const parse = (keepAs: Record<number, string> = {}) =>
  parseRows(ROWS, { mapping: detectMapping(HEADER), headerRow: 0, keepAs });

describe('a column nothing was mapped to', () => {
  it('is kept under the sheet’s own heading', () => {
    const block = parse().blocks[0];
    expect(block).toBeDefined();
    expect(block?.custom).toEqual({ 'Cost per Item': '9.978', 'Shelf Life': '3 days' });
  });

  it('takes the name the operator typed instead, when they typed one', () => {
    const block = parse({ 6: 'Keeps for' }).blocks[0];
    expect(block?.custom).toEqual({ 'Cost per Item': '9.978', 'Keeps for': '3 days' });
  });

  it('keeps nothing for a cell that was empty', () => {
    const block = parse().blocks[0];
    // Row 2 has neither, and the block reads its own row, so both are present
    // once rather than blank-padded.
    expect(Object.values(block?.custom ?? {})).not.toContain('');
  });

  it('does not keep a column that was mapped', () => {
    const block = parse().blocks[0];
    expect(Object.keys(block?.custom ?? {})).not.toContain('Unit Rate');
    expect(Object.keys(block?.custom ?? {})).not.toContain('Quantity');
  });
});

describe('a sheet with nothing left over', () => {
  it('keeps an empty set rather than inventing one', () => {
    const header = ['Recipe Name', 'Ingredient', 'Quantity', 'Unit', 'Unit Rate'];
    const out = parseRows([header, ['A', 'Rice', '1', 'kg', '3']], {
      mapping: detectMapping(header),
      headerRow: 0,
    });
    expect(out.blocks[0]?.custom).toEqual({});
  });
});

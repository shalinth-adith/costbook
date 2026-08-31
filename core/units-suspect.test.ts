/**
 * A sheet that contradicts its own unit labels.
 *
 * The reference workbook labels 96 rows "gm" and writes 0.005, 0.12 and 1.5
 * beside them — five milligrams of turmeric, a gram and a half of dal. The
 * same ingredients elsewhere say "kg" with quantities of the same size and the
 * same rate. Believed literally, a 23/kg ingredient becomes 23/gram and one
 * plate of jeera rice costs 23,000.
 */
import { describe, expect, it } from 'vitest';

import { suspectUnits } from './units-suspect';

const row = (r: number, qty: number, unit: string) => ({ row: r, qty, unit });

describe('grams that are really kilos', () => {
  const sheet = [
    // What a kilo row looks like on this sheet.
    row(1, 0.1, 'kg'), row(2, 0.15, 'kg'), row(3, 0.08, 'kg'), row(4, 0.2, 'kg'),
    // Labelled grams, but the same size.
    row(5, 0.12, 'gm'), row(6, 0.15, 'gm'), row(7, 0.005, 'gm'), row(8, 0.04, 'gm'),
  ];

  it('doubts the label', () => {
    const found = suspectUnits(sheet);
    expect(found).toHaveLength(1);
    expect(found[0]?.wrote).toBe('g');
    expect(found[0]?.means).toBe('kg');
    expect(found[0]?.rows).toBe(4);
  });

  it('shows the operator their own rows', () => {
    const [found] = suspectUnits(sheet);
    expect(found?.examples.map((e) => e.row)).toEqual([5, 6, 7, 8]);
  });
});

describe('grams that really are grams', () => {
  it('says nothing', () => {
    // A sheet weighing spices properly: grams a thousand times larger.
    const found = suspectUnits([
      row(1, 0.1, 'kg'), row(2, 0.15, 'kg'), row(3, 0.2, 'kg'), row(4, 0.12, 'kg'),
      row(5, 100, 'g'), row(6, 150, 'g'), row(7, 200, 'g'), row(8, 120, 'g'),
    ]);
    expect(found).toEqual([]);
  });
});

describe('what it refuses to judge', () => {
  it('says nothing about one odd row', () => {
    // One row written strangely is a row written strangely. Ninety-six is a
    // habit, and only a habit is evidence.
    expect(
      suspectUnits([
        row(1, 0.1, 'kg'), row(2, 0.15, 'kg'), row(3, 0.2, 'kg'), row(4, 0.12, 'kg'),
        row(5, 0.12, 'gm'),
      ]),
    ).toEqual([]);
  });

  it('never compares across families', () => {
    // Litres and kilos are not convertible without a density Costbook does not
    // hold, so a sheet using both is not contradicting itself.
    const found = suspectUnits([
      row(1, 0.1, 'kg'), row(2, 0.15, 'kg'), row(3, 0.2, 'kg'),
      row(4, 0.1, 'l'), row(5, 0.15, 'l'), row(6, 0.2, 'l'),
    ]);
    expect(found).toEqual([]);
  });

  it('ignores rows with no quantity or no unit', () => {
    expect(
      suspectUnits([
        { row: 1, qty: null, unit: 'kg' },
        { row: 2, qty: 0.1, unit: null },
        { row: 3, qty: 0, unit: 'kg' },
      ]),
    ).toEqual([]);
  });

  it('ignores a word that is not a unit', () => {
    expect(
      suspectUnits([
        row(1, 0.1, 'kg'), row(2, 0.15, 'kg'), row(3, 0.2, 'kg'),
        row(4, 1, 'as req'), row(5, 1, 'lot'), row(6, 1, 'pinch'),
      ]),
    ).toEqual([]);
  });
});

describe('millilitres that are really litres', () => {
  it('catches the volume case too', () => {
    const found = suspectUnits([
      row(1, 0.3, 'l'), row(2, 0.2, 'l'), row(3, 0.5, 'l'),
      row(4, 1, 'ml'), row(5, 1.5, 'ml'), row(6, 1, 'ml'),
    ]);
    expect(found[0]?.wrote).toBe('ml');
    expect(found[0]?.means).toBe('l');
  });
});

import { describe, expect, it } from 'vitest';

import {
  detectHeaderRow,
  detectMapping,
  parseNumber,
  parseRows,
  parseTsv,
  warningsByRow,
} from './parse';

/**
 * A sheet shaped like the reference workbook: a title, a section banner and a
 * blank above the header, blocks separated by totals rows, units that lie,
 * words that are not units, and rates derived from spend.
 */
const SHEET: readonly (readonly string[])[] = [
  ['Sri Krishna Café — recipe costing', '', '', '', '', ''],
  ['Updated 24 Aug 2026', '', '', '', '', ''],
  ['', '', '', '', '', ''],
  ['ITEM DESCRIPTION', 'QTY', 'UOM', 'RATE', 'AMOUNT', 'REMARKS'],
  ['Parotta Kuruma Plate', '', '', '', '', 'mains'],
  ['Veechu Parotta', '8', 'nos', '4.94', '39.55', ''],
  ['Onion, big', '200', 'gm', '0.04', '8.00', ''],
  ['Coriander leaves', '20', 'gms', '', '5.60', 'rate from spend'],
  ['Water', '500', 'ml', '', '', 'free'],
  ['Blending', '1', 'lot', '50', '50.00', ''],
  ['Total', '', '', '', '102.15', ''],
  ['', '', '', '', '', ''],
  ['Chicken 65', '', '', '', '', 'starters'],
  ['Chicken, dressed', '0.7', 'kg', '220', '154.00', ''],
  ['Curd, set', '80', 'gm', '0.072', '5.76', ''],
  ['Salt', '1', 'as req', '1.16', '1.16', ''],
  ['Total', '', '', '', '160.92', ''],
];

describe('the acceptance check for build step 10', () => {
  const result = parseRows(SHEET);

  it('finds the header below the title rows rather than assuming row one', () => {
    // A parser that starts at the top reads a shop name as a column heading.
    expect(result.headerRow).toBe(3);
  });

  it('recognises the columns from the words a real sheet uses', () => {
    expect(result.mapping).toEqual({ name: 0, qty: 1, unit: 2, rate: 3, total: 4 });
  });

  it('groups rows into blocks, closing each on its totals row', () => {
    expect(result.blocks.map((b) => b.name)).toEqual(['Parotta Kuruma Plate', 'Chicken 65']);
    expect(result.blocks[0]?.lines).toHaveLength(5);
    expect(result.blocks[1]?.lines).toHaveLength(3);
  });

  it('normalises the units, whatever the sheet spells them', () => {
    const lines = result.blocks[0]?.lines ?? [];
    expect(lines.map((l) => l.unit)).toEqual(['nos', 'g', 'g', 'ml', null]);
    expect(lines.map((l) => l.rawUnit)).toEqual(['nos', 'gm', 'gms', 'ml', 'lot']);
  });

  it('reads a rate from a spend when that is what the sheet carries', () => {
    // The workbook derives the rate this way on 251 lines, because it is how
    // the information arrives (TRD 6.6).
    const coriander = result.blocks[0]?.lines[2];
    expect(coriander?.name).toBe('Coriander leaves');
    expect(coriander?.entry).toBe('spend');
    expect(coriander?.rate).toBeNull();
    expect(coriander?.total).toBe(5.6);
  });

  it('keeps a rate the sheet stated as a rate', () => {
    const onion = result.blocks[0]?.lines[1];
    expect(onion?.entry).toBe('rate');
    expect(onion?.rate).toBe(0.04);
  });

  it('never discards a column it was not asked about', () => {
    expect(result.unmappedColumns).toEqual([{ index: 5, header: 'REMARKS' }]);
    expect(result.warnings.some((w) => w.code === 'unmapped_columns')).toBe(true);
  });
});

describe('the pathologies from a real workbook', () => {
  const result = parseRows(SHEET);
  const lineNamed = (name: string) =>
    result.blocks.flatMap((b) => b.lines).find((l) => l.name === name);

  it('turns a word that is not a unit into a cost with a label', () => {
    // `lot`, `as req`, `pinch`, `pkt`, `box`. Forcing them into a family
    // produces nonsense, so they carry an amount and no quantity (TRD 3.1).
    expect(lineNamed('Blending')?.kind).toBe('flat');
    expect(lineNamed('Salt')?.kind).toBe('flat');
    expect(lineNamed('Onion, big')?.kind).toBe('ingredient');
  });

  it('explains an unrecognised unit rather than guessing a conversion', () => {
    const warning = result.warnings.find(
      (w) => w.code === 'unrecognised_unit' && w.subject === 'Blending',
    );
    expect(warning?.message).toContain('lot');
    expect(warning?.message).toContain('cost with a label');
  });

  it('keeps a free ingredient rather than dropping the row', () => {
    // Water has a quantity and no rate. It carries yield meaning, so the row
    // stays and is flagged rather than discarded (TRD 7.1).
    const water = lineNamed('Water');
    expect(water).toBeDefined();
    expect(water?.qty).toBe(500);
    expect(water?.rate).toBeNull();
    expect(result.warnings.some((w) => w.code === 'no_rate' && w.subject === 'Water')).toBe(true);
  });

  it('never invents a rate for a row that has none', () => {
    expect(lineNamed('Water')?.rate).toBeNull();
    expect(lineNamed('Water')?.total).toBeNull();
    expect(lineNamed('Water')?.entry).toBe('none');
  });

  it('flags a quantity whose magnitude does not suit its stated unit', () => {
    // 97 rows labelled gm held kilograms, via an inline =50/1000. The label is
    // decorative and the arithmetic is real, so we flag rather than correct —
    // silently multiplying by a thousand is how a parser destroys a menu.
    const suspect = parseRows([
      ['ITEM', 'QTY', 'UOM', 'RATE'],
      ['Dish', '', '', ''],
      ['Onion, big', '0.05', 'gm', '40'],
    ]);
    const warning = suspect.warnings.find((w) => w.code === 'magnitude_suspect');

    expect(warning).toBeDefined();
    expect(warning?.message).toContain('0.05 gm');
    expect(warning?.message).toContain('kept the figure as written');
    // The figure itself is untouched.
    expect(suspect.blocks[0]?.lines[0]?.qty).toBe(0.05);
  });

  it('flags a rate and a total that disagree, keeping both', () => {
    const conflict = parseRows([
      ['ITEM', 'QTY', 'UOM', 'RATE', 'AMOUNT'],
      ['Dish', '', '', '', ''],
      ['Ghee', '10', 'g', '0.62', '6'], // a hardcoded 6 where a formula should be
    ]);
    const warning = conflict.warnings.find((w) => w.code === 'inconsistent_total');

    expect(warning?.message).toContain('6.20');
    expect(conflict.blocks[0]?.lines[0]?.rate).toBe(0.62);
    expect(conflict.blocks[0]?.lines[0]?.total).toBe(6);
  });

  it('offers to link a line that is standing in for a recipe on file', () => {
    // `Poriya (side), 13 portion @ 0.50` — a sub-recipe faked by hand, and the
    // strongest signal in the file that the operator wants nesting.
    const result2 = parseRows(
      [
        ['ITEM', 'QTY', 'UOM', 'RATE'],
        ['Meals plate', '', '', ''],
        ['Poriya (side)', '13', 'portion', '0.50'],
      ],
      { knownRecipes: ['Poriya'] },
    );

    const warning = result2.warnings.find((w) => w.code === 'possible_sub_recipe');
    expect(warning?.message).toContain('Poriya');
    expect(warning?.message).toContain('link it');
    // Until it is linked it is a flat line, because `portion` is not a unit.
    expect(result2.blocks[0]?.lines[0]?.kind).toBe('flat');
  });

  it('ignores the sheet own totals rather than trusting them', () => {
    // The workbook rounds inconsistently between blocks, so its arithmetic is
    // recomputed rather than read (TRD 7.1).
    const names = parseRows(SHEET).blocks.flatMap((b) => b.lines).map((l) => l.name);
    expect(names).not.toContain('Total');
  });
});

describe('reading a cell', () => {
  it('handles the separators a real sheet carries', () => {
    expect(parseNumber('3,240.00')).toBe(3240);
    expect(parseNumber('1,04,320.00')).toBe(104320);
    expect(parseNumber('₹ 620.00')).toBe(620);
    expect(parseNumber('  46.30 ')).toBe(46.3);
    expect(parseNumber('88%')).toBe(88);
  });

  it('returns nothing rather than a zero for anything it cannot read', () => {
    // An unparsed cell that becomes zero is the failure this product exists to
    // avoid: a plausible figure nobody entered.
    for (const cell of ['', '   ', 'as required', 'n/a', '-', '1/4', undefined]) {
      expect(parseNumber(cell)).toBeNull();
    }
  });
});

describe('finding the header', () => {
  it('picks the densest row of words in the first stretch', () => {
    expect(detectHeaderRow(SHEET)).toBe(3);
  });

  it('says so rather than guessing when there is no header at all', () => {
    const result = parseRows([['1', '2'], ['3', '4']]);
    expect(result.headerRow).toBeNull();
    expect(result.warnings[0]?.code).toBe('no_header');
    expect(result.warnings[0]?.message).toContain('Point at the header row');
    expect(result.blocks).toEqual([]);
  });

  it('accepts a header row the operator pointed at', () => {
    const result = parseRows(SHEET, { headerRow: 3 });
    expect(result.headerRow).toBe(3);
    expect(result.blocks).toHaveLength(2);
  });

  it('matches the column words real sheets use', () => {
    expect(detectMapping(['Particulars', 'Weight', 'U.O.M', 'Unit Price', 'Value', 'Yield %']))
      .toEqual({ name: 0, qty: 1, unit: 2, rate: 3, total: 4, yield: 5 });
  });
});

describe('pasted rows', () => {
  it('reads a block pasted straight out of a spreadsheet', () => {
    // The same parser as the file importer, so a paste and an upload cannot
    // drift apart (FLOWS 5).
    const pasted = parseTsv(
      [
        'Ingredient\tQty\tUnit\tRate',
        'Ghee, Aavin\t15\tg\t0.62',
        'Milagai podi\t8\tg\t',
        'Curry leaves\t4\tg\t0.335',
      ].join('\n'),
    );

    expect(pasted.blocks).toHaveLength(1);
    expect(pasted.blocks[0]?.lines.map((l) => l.name)).toEqual([
      'Ghee, Aavin',
      'Milagai podi',
      'Curry leaves',
    ]);
    expect(pasted.blocks[0]?.lines[1]?.rate).toBeNull();
  });

  it('handles carriage returns from a Windows spreadsheet', () => {
    const pasted = parseTsv('Ingredient\tQty\tUnit\r\nGhee\t15\tg\r\n');
    expect(pasted.blocks[0]?.lines[0]?.name).toBe('Ghee');
  });

  it('groups warnings by row for the review screen', () => {
    const byRow = warningsByRow(parseRows(SHEET));
    expect(byRow.size).toBeGreaterThan(0);
    for (const [row, list] of byRow) {
      expect(Number.isInteger(row)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    }
  });
});

describe('every warning reads as a sentence', () => {
  it('never shows a code, a placeholder or an object', () => {
    const result = parseRows(SHEET, { knownRecipes: ['Veechu Parotta'] });
    expect(result.warnings.length).toBeGreaterThan(0);

    for (const warning of result.warnings) {
      expect(warning.message).not.toMatch(/undefined|NaN|\[object|null/);
      expect(warning.message.length).toBeGreaterThan(20);
      expect(warning.message).toMatch(/[.!]$/);
    }
  });
});

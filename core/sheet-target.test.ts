/**
 * The target belongs to the operator, not to Costbook.
 *
 * The reference workbook prices every dish at `=J/0.2` — a 20% food cost,
 * stated on 36 rows. Costbook's own default is 32%, and applying it to that
 * sheet suggests the operator cut a price from 0.96 to 0.69. The sheet is the
 * authority on what its owner is aiming for; these tests hold that line.
 */

import { describe, expect, it } from 'vitest';
import { targetFromSheet } from './parse';

const HEADER = [
  'Menu Section', 'Recipe Name', 'Ingredient', 'Quantity', 'Unit', 'Unit Rate',
  'Price (AED)', 'Output (KG)', 'Output (NO)', 'Cost per Item', 'Expected SP',
];

/** A dish row carrying only the two figures that matter here. */
const dish = (cost: string, price: string): string[] => {
  const row = Array.from({ length: 11 }, () => '');
  row[9] = cost;
  row[10] = price;
  return row;
};

describe('targetFromSheet', () => {
  it('reads the 20% the reference workbook divides by', () => {
    const rows = [
      ['KUMBAKONAM CAFE'],
      HEADER,
      dish('1.210', '6.050'),
      dish('0.191', '0.955'),
      dish('2.500', '12.500'),
      dish('0.712', '3.560'),
      dish('4.000', '20.000'),
    ];
    const t = targetFromSheet(rows, 1);
    expect(t).not.toBeNull();
    expect(t?.percent).toBe(20);
    expect(t?.rows).toBe(5);
    expect(t?.of).toBe(5);
  });

  it('quotes the sheet its own column names back', () => {
    const rows = [HEADER, dish('1', '5'), dish('2', '10'), dish('3', '15'), dish('4', '20')];
    const t = targetFromSheet(rows, 0);
    expect(t?.costHeader).toBe('Cost per Item');
    expect(t?.priceHeader).toBe('Expected SP');
  });

  it('survives the one row somebody edited by hand', () => {
    const rows = [
      HEADER,
      dish('1', '5'), dish('2', '10'), dish('3', '15'), dish('4', '20'),
      dish('5', '25'), dish('6', '30'), dish('7', '35'),
      dish('9', '18'), // 50% — a hand-priced outlier
    ];
    const t = targetFromSheet(rows, 0);
    expect(t?.percent).toBe(20);
    expect(t?.rows).toBe(7);
    expect(t?.of).toBe(8);
  });

  it('stays silent when a menu was priced dish by dish', () => {
    const rows = [
      HEADER,
      dish('1', '3'), dish('2', '9'), dish('3', '7'),
      dish('4', '19'), dish('5', '11'), dish('6', '31'),
    ];
    expect(targetFromSheet(rows, 0)).toBeNull();
  });

  it('stays silent on too few rows to be a policy', () => {
    const rows = [HEADER, dish('1', '5'), dish('2', '10'), dish('3', '15')];
    expect(targetFromSheet(rows, 0)).toBeNull();
  });

  it('stays silent when the sheet carries no price column', () => {
    const rows = [
      ['Recipe Name', 'Cost per Item'],
      ['Dosa', '1.21'], ['Idly', '0.19'], ['Pongal', '2.5'], ['Kichadi', '0.71'],
    ];
    expect(targetFromSheet(rows, 0)).toBeNull();
  });

  it('ignores a row priced below what it costs', () => {
    const rows = [
      HEADER,
      dish('9', '4'), // sold at a loss; not a target
      dish('1', '5'), dish('2', '10'), dish('3', '15'), dish('4', '20'),
    ];
    const t = targetFromSheet(rows, 0);
    expect(t?.percent).toBe(20);
    expect(t?.of).toBe(4);
  });

  it('reads a 30% sheet as 30, not as Costbook’s own figure', () => {
    const rows = [HEADER, dish('3', '10'), dish('6', '20'), dish('9', '30'), dish('1.5', '5')];
    expect(targetFromSheet(rows, 0)?.percent).toBe(30);
  });

  it('has nothing to read without a header row', () => {
    expect(targetFromSheet([HEADER, dish('1', '5')], null)).toBeNull();
  });
});

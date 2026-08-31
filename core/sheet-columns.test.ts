/**
 * The columns a real sheet carries, and what they must map to.
 *
 * Modelled on the reference workbook's own header, which is where these were
 * found missing: Output (NO) had nowhere to go, so a batch written to serve
 * fifty was costed as though it served one, and every figure on the dish read
 * fifty times what it should.
 */
import { describe, expect, it } from 'vitest';

import { currencyFromHeader, detectMapping, missingFields } from './parse';

/** The reference workbook's header row, verbatim. */
const HEADER = [
  'Menu Section', 'Recipe Name', 'Ingredient', 'Quantity', 'Unit', 'Unit Rate',
  'Price (AED)', 'Output (KG)', 'Output (NO)', 'Cost per Item', 'Expected SP',
  'Preparation Method',
] as const;

const named = () => {
  const m = detectMapping([...HEADER]);
  return Object.fromEntries(Object.entries(m).map(([f, i]) => [f, HEADER[i as number]]));
};

describe('a real sheet header', () => {
  it('places every column that carries costing information', () => {
    expect(named()).toEqual({
      section: 'Menu Section',
      recipe: 'Recipe Name',
      name: 'Ingredient',
      qty: 'Quantity',
      unit: 'Unit',
      rate: 'Unit Rate',
      total: 'Price (AED)',
      output: 'Output (KG)',
      portions: 'Output (NO)',
      sellingPrice: 'Expected SP',
      method: 'Preparation Method',
    });
  });

  // The one that was costing fifty times too much.
  it('finds the portion count', () => {
    expect(named()['portions']).toBe('Output (NO)');
  });

  /*
   * "Price" is a line total, not a rate. In this sheet it is literally
   * `=Quantity * Unit Rate`. Reading it as a rate divides by the quantity a
   * second time.
   */
  it('reads Price as the line total and Unit Rate as the rate', () => {
    const m = named();
    expect(m['total']).toBe('Price (AED)');
    expect(m['rate']).toBe('Unit Rate');
  });

  /*
   * Cost per Item is `batch ÷ portions` — a figure Costbook derives. Importing
   * it would mean importing the sheet's answer rather than checking it, and it
   * would take the line-total slot from the column that holds one.
   */
  it('refuses to map a column the sheet computed', () => {
    expect(Object.values(named())).not.toContain('Cost per Item');
  });

  it('reads the currency off the heading', () => {
    expect(currencyFromHeader([...HEADER])).toBe('AED');
  });

  it('has no currency to read when no heading names one', () => {
    expect(currencyFromHeader(['Ingredient', 'Qty', 'Rate', 'Total'])).toBeNull();
  });

  it('still maps a plain Price column with no currency on it', () => {
    const m = detectMapping(['Ingredient', 'Qty', 'Unit', 'Rate', 'Price']);
    expect(m.total).toBe(4);
  });
});

describe('other names for the same columns', () => {
  it('finds a portion count however the sheet words it', () => {
    for (const word of ['Portions', 'Serves', 'Output NOS', 'No of Portions', 'Pieces']) {
      const m = detectMapping(['Recipe', 'Ingredient', 'Qty', 'Unit', word]);
      expect(m.portions, word).toBe(4);
    }
  });

  it('finds a selling price however the sheet words it', () => {
    for (const word of ['Selling Price', 'Menu Price', 'MRP', 'Expected SP']) {
      const m = detectMapping(['Recipe', 'Ingredient', 'Qty', 'Unit', word]);
      expect(m.sellingPrice, word).toBe(4);
    }
  });

  it('finds the method however the sheet words it', () => {
    for (const word of ['Method', 'Procedure', 'Instructions', 'Preparation']) {
      const m = detectMapping(['Recipe', 'Ingredient', 'Qty', 'Unit', word]);
      expect(m.method, word).toBe(4);
    }
  });
});

/**
 * Rate is tested before unit, and the order is load-bearing.
 *
 * Matching is exact-or-prefix, and "unit rate" and "unit price" both start
 * with "unit ". Tested the other way round, a sheet with no separate Unit
 * column has its rate column read as the unit — found on two fixture sheets,
 * one of which then reported no missing fields and would have skipped the
 * mapping step entirely.
 */
describe('a rate column that starts with the word unit', () => {
  it('is a rate, not a unit', () => {
    for (const word of ['Unit Rate', 'Unit Price', 'Unit Price (AED/kg)', 'Unit Cost']) {
      const m = detectMapping(['Ingredient', 'Quantity', word]);
      expect(m.rate, word).toBe(2);
      expect(m.unit, word).toBeUndefined();
    }
  });

  it('still finds a plain Unit column beside one', () => {
    const m = detectMapping(['Ingredient', 'Quantity', 'Unit', 'Unit Rate']);
    expect(m.unit).toBe(2);
    expect(m.rate).toBe(3);
  });

  it('reports the unit as missing when the sheet truly has none', () => {
    const m = detectMapping(['Recipe Name', 'Ingredient', 'Quantity', 'Unit Rate']);
    expect(missingFields(m)).toContain('unit');
  });
});

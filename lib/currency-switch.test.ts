import { describe, expect, it } from 'vitest';

import { formatMoney } from '@/core/currency';
import { recipeCost } from '@/core/recipe';

import { DEFAULT_MODEL, buildUp } from './costing';
import {
  allIngredients,
  conversionHistory,
  currencyCode,
  getMeta,
  orgModel,
  pantry,
  switchCurrency,
} from './store';

/**
 * What "change the currency" has to mean.
 *
 * Relabelling would be the dangerous version: an account holding rupee rates
 * with a dirham symbol on them has not changed currency, it has multiplied
 * its whole menu by about twenty-three and presented the result as fact.
 * These assert that every figure actually moved.
 */

const RATE = 23.5; // 1 AED = 23.50 INR, as the operator entered it
const AT = '2026-08-29T00:00:00.000Z';

const costOf = (id: string): number | null => {
  const p = pantry();
  const r = p.recipes.get(id);
  if (r === undefined) throw new Error(`no recipe ${id}`);
  // The account's own model, because packaging is money and it converts.
  return buildUp(recipeCost(r, p), { ...DEFAULT_MODEL, ...orgModel() }).total;
};

const rateOf = (name: string): number | null =>
  allIngredients().find((i) => i.name === name)?.purchasePrice ?? null;

describe('switching the account currency', () => {
  it('starts where the operator set it up', () => {
    expect(currencyCode()).toBe('INR');
  });

  it('converts every ingredient rate, and every dish with it', () => {
    const onionBefore = rateOf('Onion, big');
    const plateBefore = costOf('plate');
    const podiBefore = costOf('podi-idly');

    switchCurrency({ from: 'INR', to: 'AED', rate: RATE }, AT);

    expect(currencyCode()).toBe('AED');
    expect(rateOf('Onion, big')).toBeCloseTo((onionBefore ?? 0) / RATE, 10);
    expect(costOf('plate')).toBeCloseTo((plateBefore ?? 0) / RATE, 9);
    expect(costOf('podi-idly')).toBeCloseTo((podiBefore ?? 0) / RATE, 9);
  });

  it('converts the menu prices too, so food cost does not move', () => {
    // The ratio of cost to price is the same number in any currency. If food
    // cost shifted on a currency change, one side had not converted.
    const podi = getMeta('podi-idly');
    const cost = costOf('podi-idly');
    expect(podi?.sellingPrice).not.toBeNull();

    const foodCost = ((cost ?? 0) / (podi?.sellingPrice ?? 1)) * 100;
    expect(foodCost).toBeCloseTo(28.36, 1);
  });

  it('leaves an ingredient with no rate still without one', () => {
    // Nothing is invented by a conversion any more than by anything else.
    expect(rateOf('Nannari syrup')).toBeNull();
  });

  it('records what was done, so any figure can be traced back', () => {
    const [latest] = conversionHistory();
    expect(latest?.from).toBe('INR');
    expect(latest?.to).toBe('AED');
    expect(latest?.rate).toBe(RATE);
    expect(latest?.at).toBe(AT);
  });

  it('shows the new figures the way that currency writes them', () => {
    const cost = costOf('podi-idly');
    // A dirham puts its code after the figure, where a rupee puts its symbol
    // before it.
    expect(formatMoney(cost, 'AED')).toMatch(/^\d+\.\d{2} AED$/);
    expect(formatMoney(cost, 'INR')).toMatch(/^₹ /);
  });

  it('converts back to where it started', () => {
    const before = costOf('plate');
    switchCurrency({ from: 'AED', to: 'INR', rate: 1 / RATE }, AT);

    expect(currencyCode()).toBe('INR');
    expect(costOf('plate')).toBeCloseTo((before ?? 0) * RATE, 8);
    expect(conversionHistory()).toHaveLength(2);
  });
});

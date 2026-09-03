/**
 * Three last steps, three more lines, and a sticker that may include tax.
 *
 * The research and the tools agree on one ladder with different last steps.
 * These pin the arithmetic of each step and of the lines a small kitchen
 * leaves out, and the one thing that goes wrong across borders: a target
 * applied to a tax-inclusive sticker as if it were net.
 */

import { describe, expect, it } from 'vitest';

import type { Charge } from '@/core/charges';
import type { RecipeCost } from '@/core/recipe';

import {
  DEFAULT_MODEL,
  buildUp,
  dishModel,
  foodCostPercent,
  netPriceOf,
  suggestPrice,
} from './costing';

/** A complete dish: a 40-plate batch of 30.17 in ingredients. */
const koottu: RecipeCost = {
  kind: 'cost',
  id: 'koottu',
  name: 'Koottu',
  portions: 40,
  outputQty: 40,
  outputUnit: 'pc',
  lines: [],
  assumed: [],
  batch: 30.17,
  portionAdd: 0,
  total: 30.17,
  perPortion: 30.17 / 40,
  costPerBase: 30.17 / 40,
} as unknown as RecipeCost;

const plain = { ...DEFAULT_MODEL, wastagePercent: 0, packagingPerPortion: 0 };

describe('the last step of the ladder', () => {
  it('divides by the food share, as it always did', () => {
    const s = suggestPrice(1, { ...plain, method: 'food_share', foodCostTarget: 25 });
    expect(s.net).toBeCloseTo(4, 6);
  });

  it('adds the money the owner wants left on every plate', () => {
    // "Leave me 8 on every plate" is contribution margin, said in money.
    const s = suggestPrice(2.5, { ...plain, method: 'money_per_plate', moneyPerPlate: 8 });
    expect(s.net).toBeCloseTo(10.5, 6);
  });

  it('multiplies by the factor a chef prices by in their head', () => {
    const s = suggestPrice(3, { ...plain, method: 'times_cost', factor: 3.3 });
    expect(s.net).toBeCloseTo(9.9, 6);
  });

  it('says the step in words', () => {
    expect(suggestPrice(1, { ...plain, method: 'times_cost', factor: 3 }).methodLabel).toBe('times 3');
    expect(suggestPrice(1, { ...plain, method: 'money_per_plate', moneyPerPlate: 8 }).methodLabel).toBe('plus 8 a plate');
    expect(suggestPrice(1, { ...plain, foodCostTarget: 30 }).methodLabel).toBe('divided by your 30%');
  });
});

describe('the lines a small kitchen leaves out', () => {
  it('counts nothing it was not told about', () => {
    const b = buildUp(koottu, plain);
    expect(b.accompaniments).toBeNull();
    expect(b.labour).toBeNull();
    expect(b.overhead).toBeNull();
    expect(b.total).toBeCloseTo(30.17 / 40, 6);
  });

  it('adds what goes on every plate, and rent, per portion', () => {
    const b = buildUp(koottu, { ...plain, accompanimentsPerPortion: 0.4, overheadPerPortion: 0.3 });
    expect(b.accompaniments?.amount).toBeCloseTo(0.4, 6);
    expect(b.overhead?.amount).toBeCloseTo(0.3, 6);
    expect(b.total).toBeCloseTo(30.17 / 40 + 0.7, 6);
  });

  it('spreads a batch’s minutes over its portions at the kitchen rate', () => {
    // 6 minutes at 18 an hour is 1.80 a batch; over 40 plates, 0.045 each.
    const b = buildUp(koottu, { ...plain, labourRatePerHour: 18 }, { labourMinutes: 6 });
    expect(b.labour?.amount).toBeCloseTo(0.045, 6);
    expect(b.labour?.isDefault).toBe(false);
  });

  it('shows no labour line without a rate, and none without minutes', () => {
    expect(buildUp(koottu, plain, { labourMinutes: 6 }).labour).toBeNull();
    expect(buildUp(koottu, { ...plain, labourRatePerHour: 18 }).labour).toBeNull();
  });
});

const vat: Charge = {
  name: 'VAT',
  mode: 'percent',
  value: 5,
  base: 'net_subtotal',
  order: 1,
  compounds: false,
  borneBy: 'guest',
  channels: ['dine_in', 'takeaway', 'delivery'],
};

describe('a menu price that already includes the guest’s charges', () => {
  const inclusive = { ...plain, pricesIncludeCharges: true, charges: [vat] };

  it('takes the charges back off before applying the target', () => {
    // A 30% target on a 5%-inclusive sticker is really 31.5% of what is kept.
    expect(netPriceOf(10.5, inclusive)).toBeCloseTo(10, 6);
    expect(foodCostPercent(3, 10.5, inclusive)).toBeCloseTo(30, 6);
    expect(foodCostPercent(3, 10.5)).toBeCloseTo(28.571, 2);
  });

  it('suggests a sticker, and reports the food cost on what is kept', () => {
    const s = suggestPrice(3, { ...inclusive, foodCostTarget: 30, rounding: 'none' });
    expect(s.net).toBeCloseTo(10, 6);
    expect(s.exact).toBeCloseTo(10.5, 6);
    expect(s.roundedFoodCost).toBeCloseTo(30, 6);
  });

  it('leaves a net-quoted menu alone', () => {
    const s = suggestPrice(3, { ...plain, charges: [vat], foodCostTarget: 30, rounding: 'none' });
    expect(s.exact).toBeCloseTo(10, 6);
  });
});

describe('a dish’s own figures', () => {
  it('override the account line by line, and null means follow', () => {
    const org = { ...plain, accompanimentsPerPortion: 0.4, overheadPerPortion: 0.3, moneyPerPlate: 8 };
    const m = dishModel(org, { accompanimentsPerPortion: 0, overheadPerPortion: null, moneyPerPlate: undefined });
    expect(m.accompanimentsPerPortion).toBe(0);
    expect(m.overheadPerPortion).toBe(0.3);
    expect(m.moneyPerPlate).toBe(8);
  });
});

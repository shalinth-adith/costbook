import { describe, expect, it } from 'vitest';

import {
  CURRENCIES,
  ConversionError,
  assertConvertible,
  convert,
  convertOptional,
  currency,
  describeConversion,
  formatMoney,
  formatRate,
  isKnownCurrency,
} from './currency';

describe('showing money the way the currency does', () => {
  it('puts the symbol where that currency puts it', () => {
    expect(formatMoney(46.3, 'INR')).toBe('₹ 46.30');
    expect(formatMoney(46.3, 'AED')).toBe('46.30 AED');
    expect(formatMoney(46.3, 'GBP')).toBe('£ 46.30');
  });

  it('groups digits the way that currency groups them', () => {
    // A rupee groups in lakhs. A dollar does not. Getting this wrong makes a
    // figure look foreign to the person reading it.
    expect(formatMoney(104320, 'INR', { withSymbol: false })).toBe('1,04,320.00');
    expect(formatMoney(104320, 'USD', { withSymbol: false })).toBe('104,320.00');
  });

  it('uses the decimals the currency actually has', () => {
    // Not everything is two. A dinar is three, a yen is none.
    expect(formatMoney(46.3, 'KWD', { withSymbol: false })).toBe('46.300');
    expect(formatMoney(46.3, 'OMR', { withSymbol: false })).toBe('46.300');
    expect(formatMoney(4630, 'JPY', { withSymbol: false })).toBe('4,630');
  });

  it('reads an absent figure as a dash, never as a zero', () => {
    for (const code of ['INR', 'AED', 'JPY']) {
      expect(formatMoney(null, code)).toBe('—');
      expect(formatMoney(undefined, code)).toBe('—');
      expect(formatRate(null, code)).toBe('—');
    }
  });

  it('gives a rate more places than money, so a per-gram figure is not 0.00', () => {
    expect(formatRate(0.0455, 'INR')).toBe('0.0455');
    expect(formatMoney(0.0455, 'INR', { withSymbol: false })).toBe('0.05');
  });
});

describe('the list on offer', () => {
  it('covers the markets the product is for, and the majors', () => {
    const codes = CURRENCIES.map((c) => c.code);
    for (const code of ['INR', 'AED', 'SAR', 'USD', 'EUR', 'GBP']) {
      expect(codes).toContain(code);
    }
  });

  it('holds no exchange rate anywhere', () => {
    // A rate we stored is a rate we are wrong about tomorrow. Same rule as
    // tax: we compute what we are told (COSTING_MODELS 4.3).
    const serialised = JSON.stringify(CURRENCIES);
    expect(serialised).not.toMatch(/"rate"|"exchange"|"usdPer|"perUsd/i);
  });

  it('falls back rather than throwing on a code it does not know', () => {
    expect(isKnownCurrency('XYZ')).toBe(false);
    expect(currency('XYZ').code).toBe('INR');
  });
});

describe('moving an account to another currency', () => {
  const toAed = { from: 'INR', to: 'AED', rate: 23.5 };

  it('converts by the rate the operator supplied', () => {
    // 1 AED = 23.50 INR, so a 40-rupee kilo is 1.70 dirhams.
    expect(convert(40, toAed)).toBeCloseTo(40 / 23.5, 12);
    expect(formatMoney(convert(40, toAed), 'AED')).toBe('1.70 AED');
  });

  it('says which way round the rate goes, so it cannot be misread', () => {
    expect(describeConversion(toAed)).toBe('1 AED = 23.50 INR');
  });

  it('holds full precision rather than rounding each figure', () => {
    // Rounding here compounds across every rate in the book and leaves the
    // whole menu a little wrong (TRD 4).
    const converted = convert(0.0455, toAed);
    expect(converted).toBeCloseTo(0.0455 / 23.5, 15);
    expect(converted).not.toBe(0);
  });

  it('round-trips back to the figure it started from', () => {
    const there = convert(31.66, toAed);
    const back = convert(there, { from: 'AED', to: 'INR', rate: 1 / 23.5 });
    expect(back).toBeCloseTo(31.66, 10);
  });

  it('leaves an absent figure absent', () => {
    // An ingredient with no rate has no rate in the new currency either.
    expect(convertOptional(null, toAed)).toBeNull();
    expect(convertOptional(40, toAed)).toBeCloseTo(40 / 23.5, 12);
  });
});

describe('a conversion that cannot be trusted is refused', () => {
  it('refuses a rate of zero or less', () => {
    for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertConvertible({ from: 'INR', to: 'AED', rate })).toThrowError(ConversionError);
    }
  });

  it('says plainly that it does not look a rate up', () => {
    try {
      assertConvertible({ from: 'INR', to: 'AED', rate: 0 });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ConversionError).message).toContain('does not look one up');
    }
  });

  it('refuses a move to the currency already in use', () => {
    expect(() => assertConvertible({ from: 'INR', to: 'INR', rate: 1 })).toThrowError(ConversionError);
  });

  it('refuses a currency it does not know', () => {
    expect(() => assertConvertible({ from: 'INR', to: 'XYZ', rate: 2 })).toThrowError(ConversionError);
  });
});

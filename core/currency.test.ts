import { describe, expect, it } from 'vitest';

import { CURRENCIES, currency, formatMoney, formatRate, isKnownCurrency } from './currency';

describe('showing money the way the currency does', () => {
  it('puts the symbol where that currency puts it', () => {
    expect(formatMoney(46.3, 'INR')).toBe('₹ 46.30');
    // Code first with a space, the way a menu in Dubai writes it. It was a
    // suffix, which printed "46.30 AED" and is how nobody there writes it.
    expect(formatMoney(46.3, 'AED')).toBe('AED 46.30');
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

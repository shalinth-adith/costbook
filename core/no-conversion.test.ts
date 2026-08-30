/**
 * Costbook never converts between currencies.
 *
 * Written because the currency picker was misread as an exchange-rate table:
 * it shows the same amount beside every currency, to demonstrate where the
 * symbol sits and how many decimals each one carries, and a column of figures
 * in a picker looks exactly like a conversion whatever the prose above it says.
 *
 * The screen was fixed. This is here so the claim it now makes stays true —
 * if anyone ever adds a rate table, these fail.
 */
import { describe, expect, it } from 'vitest';

import { CURRENCIES, formatMoney, formatRate } from './currency';

const AMOUNT = 1234.5;

/*
 * Locale-aware, because a naive digit-strip is wrong: several of these locales
 * write 1.234,50 or 1 234,50, and throwing away the separators turns that into
 * 123450. The formatter's own output for the same amount is the comparison —
 * if the number Costbook writes is the number Intl writes, nothing scaled it.
 */
function writtenBy(amount: number, locale: string, decimals: number): string {
  return amount.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

describe('formatting is not conversion', () => {
  it('writes the amount it was given, in all 22 currencies', () => {
    for (const c of CURRENCIES) {
      expect(formatMoney(AMOUNT, c.code)).toContain(writtenBy(AMOUNT, c.locale, c.decimals));
    }
  });

  // The real proof: double the input, and every currency doubles. A conversion
  // would apply a factor of its own on top.
  it('scales exactly with its input, never by a rate of its own', () => {
    for (const c of CURRENCIES) {
      expect(formatMoney(AMOUNT * 2, c.code)).toContain(writtenBy(AMOUNT * 2, c.locale, c.decimals));
      expect(formatMoney(0, c.code)).toContain(writtenBy(0, c.locale, c.decimals));
    }
  });

  it('changes only how the figure is written, never its value', () => {
    const inr = formatMoney(AMOUNT, 'INR');
    const kwd = formatMoney(AMOUNT, 'KWD');
    // Different strings: KWD carries three decimals and puts its code after.
    expect(inr).not.toBe(kwd);
    // Both still say one thousand two hundred and thirty-four and a half.
    expect(inr).toContain('1,234.50');
    expect(kwd).toContain('1,234.500');
  });

  it('holds for a rate as well as an amount', () => {
    for (const c of CURRENCIES) {
      // A rate runs to more places than money; the digits are still the ones
      // handed in.
      expect(formatRate(0.0425, c.code)).toMatch(/0[.,]04/);
    }
  });
});

describe('the currency module offers no way to convert', () => {
  it('exports no conversion function', async () => {
    const mod = await import('./currency');
    const names = Object.keys(mod);
    for (const suspect of ['convert', 'convertCurrency', 'exchangeRate', 'toCurrency', 'fxRate']) {
      expect(names).not.toContain(suspect);
    }
  });

  it('exports only what a formatter needs', async () => {
    const mod = await import('./currency');
    expect(Object.keys(mod).sort()).toEqual(
      ['CURRENCIES', 'DEFAULT_CURRENCY', 'currency', 'formatMoney', 'formatRate', 'isKnownCurrency'].sort(),
    );
  });
});

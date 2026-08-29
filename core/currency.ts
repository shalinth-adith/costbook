/**
 * Currencies, and how each one writes a figure.
 *
 * Which symbol, which side of the number it sits on, how many decimals the
 * currency actually uses, and how the digits group. A rupee groups in lakhs
 * and a dollar does not; a dinar has three decimals and a yen has none.
 * Getting that wrong makes a figure look foreign to the person reading it.
 *
 * One currency per organisation, chosen at setup, and no conversion (TRD 4).
 * An account's rates are entered in its own currency and stay in it. Moving
 * an account between currencies is a real feature and a separate decision —
 * it needs a rate the operator supplies, a record of what was used, and a way
 * back — so it is not half-built here.
 */

export type CurrencyPosition = 'prefix' | 'suffix';

export interface Currency {
  readonly code: string;
  readonly symbol: string;
  readonly name: string;
  /** Which side of the figure the symbol sits on. */
  readonly position: CurrencyPosition;
  /** How many decimals this currency actually uses. Not always two. */
  readonly decimals: number;
  /** For digit grouping: a rupee groups in lakhs, a dollar does not. */
  readonly locale: string;
}

/**
 * The currencies on offer. India and the Gulf first, because that is who this
 * is for; the majors after, because operators move.
 *
 * No exchange rates live here and none ever should — they are a figure that
 * changes daily and that we would be wrong about the moment we stored it.
 */
export const CURRENCIES: readonly Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian rupee', position: 'prefix', decimals: 2, locale: 'en-IN' },
  { code: 'AED', symbol: 'AED', name: 'UAE dirham', position: 'suffix', decimals: 2, locale: 'en-AE' },
  { code: 'SAR', symbol: 'SAR', name: 'Saudi riyal', position: 'suffix', decimals: 2, locale: 'en-SA' },
  { code: 'QAR', symbol: 'QAR', name: 'Qatari riyal', position: 'suffix', decimals: 2, locale: 'en-QA' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani rial', position: 'suffix', decimals: 3, locale: 'en-OM' },
  { code: 'BHD', symbol: 'BHD', name: 'Bahraini dinar', position: 'suffix', decimals: 3, locale: 'en-BH' },
  { code: 'KWD', symbol: 'KWD', name: 'Kuwaiti dinar', position: 'suffix', decimals: 3, locale: 'en-KW' },
  { code: 'USD', symbol: '$', name: 'US dollar', position: 'prefix', decimals: 2, locale: 'en-US' },
  { code: 'EUR', symbol: '€', name: 'Euro', position: 'prefix', decimals: 2, locale: 'en-IE' },
  { code: 'GBP', symbol: '£', name: 'Pound sterling', position: 'prefix', decimals: 2, locale: 'en-GB' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan rupee', position: 'prefix', decimals: 2, locale: 'en-LK' },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi taka', position: 'prefix', decimals: 2, locale: 'en-BD' },
  { code: 'NPR', symbol: 'Rs', name: 'Nepalese rupee', position: 'prefix', decimals: 2, locale: 'en-NP' },
  { code: 'PKR', symbol: 'Rs', name: 'Pakistani rupee', position: 'prefix', decimals: 2, locale: 'en-PK' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian ringgit', position: 'prefix', decimals: 2, locale: 'en-MY' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore dollar', position: 'prefix', decimals: 2, locale: 'en-SG' },
  { code: 'AUD', symbol: 'A$', name: 'Australian dollar', position: 'prefix', decimals: 2, locale: 'en-AU' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian dollar', position: 'prefix', decimals: 2, locale: 'en-CA' },
  { code: 'ZAR', symbol: 'R', name: 'South African rand', position: 'prefix', decimals: 2, locale: 'en-ZA' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan shilling', position: 'prefix', decimals: 2, locale: 'en-KE' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian naira', position: 'prefix', decimals: 2, locale: 'en-NG' },
  { code: 'JPY', symbol: '¥', name: 'Japanese yen', position: 'prefix', decimals: 0, locale: 'ja-JP' },
];

const BY_CODE: ReadonlyMap<string, Currency> = new Map(CURRENCIES.map((c) => [c.code, c]));

export const DEFAULT_CURRENCY = 'INR';

export function currency(code: string): Currency {
  return BY_CODE.get(code.toUpperCase()) ?? (BY_CODE.get(DEFAULT_CURRENCY) as Currency);
}

export function isKnownCurrency(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

/**
 * A figure, in the currency's own convention.
 *
 * Absent reads as a dash, never as a zero — a figure nobody entered is not a
 * figure of nothing.
 */
export function formatMoney(
  amount: number | null | undefined,
  code: string,
  options: { readonly withSymbol?: boolean; readonly decimals?: number } = {},
): string {
  const c = currency(code);
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';

  const places = options.decimals ?? c.decimals;
  const figure = amount.toLocaleString(c.locale, {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });

  if (options.withSymbol === false) return figure;
  // The symbol sits in its own span at the call site; this is the plain-text
  // form, used where there is no markup to hang one on.
  return c.position === 'prefix' ? `${c.symbol} ${figure}` : `${figure} ${c.symbol}`;
}

/**
 * A rate runs to more places than money. A per-gram figure rounded to a
 * currency's own decimals is 0.00, which is not what it costs.
 */
export function formatRate(amount: number | null | undefined, code: string): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  const c = currency(code);
  return amount >= 1
    ? formatMoney(amount, code, { withSymbol: false })
    : formatMoney(amount, code, { withSymbol: false, decimals: Math.max(4, c.decimals) });
}

/**
 * Currencies, and moving an account from one to another.
 *
 * Two separate jobs, and they are separate on purpose.
 *
 * Showing money is presentation: which symbol, which side of the figure it
 * sits on, how many decimals the currency actually uses, and how the digits
 * group. A rupee groups in lakhs and a dollar does not, and getting that wrong
 * makes a figure look foreign to the person reading it.
 *
 * Changing currency is arithmetic, and it is the dangerous one. An account
 * holding rates in rupees that is relabelled to dirhams has not changed
 * currency — it has silently multiplied every figure by about 23 and
 * presented the result as fact. So a switch converts, at a rate the operator
 * supplies.
 *
 * Costbook never looks an exchange rate up. It is the same rule as tax
 * (COSTING_MODELS 4.3): we compute what we are told, and we do not hold a
 * figure we cannot stand behind. An exchange rate we fetched last Tuesday is
 * exactly that.
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

export type ConversionErrorCode = 'invalid_rate' | 'same_currency' | 'unknown_currency';

export class ConversionError extends Error {
  readonly code: ConversionErrorCode;

  constructor(code: ConversionErrorCode, message: string) {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
  }
}

export interface Conversion {
  readonly from: string;
  readonly to: string;
  /**
   * How many units of the old currency one unit of the new one is worth.
   * "1 AED = 23.50 INR" is a rate of 23.50 when moving from INR to AED.
   */
  readonly rate: number;
}

export function assertConvertible(conversion: Conversion): void {
  const { from, to, rate } = conversion;

  if (!isKnownCurrency(from) || !isKnownCurrency(to)) {
    throw new ConversionError('unknown_currency', 'That is not a currency Costbook knows.');
  }
  if (from.toUpperCase() === to.toUpperCase()) {
    throw new ConversionError('same_currency', 'That is the currency you are already in.');
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new ConversionError(
      'invalid_rate',
      'An exchange rate has to be a figure above zero. Costbook does not look one up for you.',
    );
  }
}

/**
 * A figure moved into the new currency.
 *
 * Full precision. Rounding here would compound across every rate in the book
 * and put the whole menu a little wrong (TRD 4).
 */
export function convert(amount: number, conversion: Conversion): number {
  assertConvertible(conversion);
  return amount / conversion.rate;
}

/** The same, for a figure that may be absent. An absent rate stays absent. */
export function convertOptional(
  amount: number | null,
  conversion: Conversion,
): number | null {
  return amount === null ? null : convert(amount, conversion);
}

/** The sentence shown beside the field, so the direction cannot be misread. */
export function describeConversion(conversion: Conversion): string {
  const from = currency(conversion.from);
  const to = currency(conversion.to);
  return `1 ${to.code} = ${formatMoney(conversion.rate, from.code, { withSymbol: false })} ${from.code}`;
}

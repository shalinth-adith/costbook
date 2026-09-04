/**
 * Where a restaurant is, and what money that usually means.
 *
 * Asked once at setup, so the currency can be proposed rather than typed and
 * a kitchen anywhere can start in under a minute. Only currencies the
 * product formats are offered; a country whose money Costbook does not yet
 * carry picks the nearest it does, and says so. Nothing here prices, taxes,
 * or advises: it is a name and a currency, and both stay changeable.
 */

import { isKnownCurrency } from '@/core/currency';

export interface Country {
  readonly code: string;
  readonly name: string;
  readonly currency: string;
}

export const COUNTRIES: readonly Country[] = [
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR' },
  { code: 'QA', name: 'Qatar', currency: 'QAR' },
  { code: 'OM', name: 'Oman', currency: 'OMR' },
  { code: 'BH', name: 'Bahrain', currency: 'BHD' },
  { code: 'KW', name: 'Kuwait', currency: 'KWD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'LK', name: 'Sri Lanka', currency: 'LKR' },
  { code: 'BD', name: 'Bangladesh', currency: 'BDT' },
  { code: 'NP', name: 'Nepal', currency: 'NPR' },
  { code: 'PK', name: 'Pakistan', currency: 'PKR' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR' },
  { code: 'KE', name: 'Kenya', currency: 'KES' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'IE', name: 'Ireland', currency: 'EUR' },
  { code: 'FR', name: 'France', currency: 'EUR' },
  { code: 'DE', name: 'Germany', currency: 'EUR' },
  { code: 'ES', name: 'Spain', currency: 'EUR' },
  { code: 'IT', name: 'Italy', currency: 'EUR' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR' },
  { code: 'BE', name: 'Belgium', currency: 'EUR' },
  { code: 'PT', name: 'Portugal', currency: 'EUR' },
  { code: 'AT', name: 'Austria', currency: 'EUR' },
  { code: 'GR', name: 'Greece', currency: 'EUR' },
  { code: 'FI', name: 'Finland', currency: 'EUR' },
];

/** The country for a code, or undefined. */
export function countryOf(code: string | null | undefined): Country | undefined {
  if (!code) return undefined;
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

/** Countries whose name or code contains the text, in list order. */
export function searchCountries(text: string): readonly Country[] {
  const q = text.trim().toLowerCase();
  if (q === '') return COUNTRIES;
  return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
}

/** True when every country offers a currency the product can format. */
export function countriesAreFormattable(): boolean {
  return COUNTRIES.every((c) => isKnownCurrency(c.currency));
}

/**
 * How many people work in the kitchen: a band, not a number, because the
 * answer is "about" and a band is honest about that. Nothing is priced by
 * it; it says how much of the product a kitchen is likely to use.
 */
export const TEAM_SIZES = [
  { id: 'solo', label: 'Just me', said: 'one pair of hands' },
  { id: 'small', label: '2 to 5', said: 'a small kitchen' },
  { id: 'medium', label: '6 to 15', said: 'a full service' },
  { id: 'large', label: '16 to 50', said: 'more than one line' },
  { id: 'xl', label: 'More than 50', said: 'several kitchens' },
] as const;
export type TeamSize = (typeof TEAM_SIZES)[number]['id'];

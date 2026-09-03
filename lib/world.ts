/**
 * Typical starting points, by currency. Suggestions, never rules.
 *
 * Costbook is for any kitchen anywhere, so nothing in here decides anything.
 * The charge stack computes what the operator says is charged; this only
 * says what kitchens paid in the same currency usually see, so a new account
 * starts from a sensible figure instead of a blank. Every figure it suggests
 * lands in a field the operator can change, and the screen says "typical,
 * not yours" beside it. A currency this table does not know gets the world's
 * general range, which is honest and still useful.
 *
 * Figures are from operators and the platforms' published rates, 2025–2026.
 */

import type { Charge } from '@/core/charges';

export type SellHow = 'dine_in' | 'delivery' | 'both';

export interface PlatformHint {
  readonly name: string;
  /** Typical commission, percent of the order, low to high. */
  readonly commission: readonly [number, number];
}

export interface WorldHint {
  /** Where this applies, in the operator's words. */
  readonly region: string;
  /** Typical food-cost targets, low to high. */
  readonly dineIn: readonly [number, number];
  readonly delivery: readonly [number, number];
  readonly platforms: readonly PlatformHint[];
  /** Whether menu prices customarily include the tax on the bill. Null when it varies. */
  readonly pricesIncludeTax: boolean | null;
  /** The tax's name where prices include it, for the sentence. */
  readonly taxName: string | null;
  /** One sentence for the owner, said the way they would say it. */
  readonly note: string;
}

const GENERIC: WorldHint = {
  region: 'most of the world',
  dineIn: [28, 35],
  delivery: [25, 30],
  platforms: [{ name: 'Delivery platform', commission: [15, 30] }],
  pricesIncludeTax: null,
  taxName: null,
  note: 'Kitchens usually aim for 28 to 35% at the counter and 25 to 30% on delivery apps, which take 15 to 30% of the order.',
};

const gulf = (region: string, taxName: string | null, platforms: readonly PlatformHint[] = [
  { name: 'Talabat', commission: [15, 30] },
  { name: 'Deliveroo', commission: [20, 30] },
  { name: 'Noon Food', commission: [10, 20] },
]): WorldHint => ({
  region,
  dineIn: [28, 35],
  delivery: [25, 30],
  platforms,
  pricesIncludeTax: taxName !== null,
  taxName,
  note: `Kitchens in ${region} usually aim for 28 to 35% at the counter and 25 to 30% on the apps, which take 15 to 30% of the order and add fees on top of that.`,
});

const HINTS: Readonly<Record<string, WorldHint>> = {
  INR: {
    region: 'India',
    dineIn: [28, 35],
    delivery: [25, 30],
    platforms: [
      { name: 'Swiggy', commission: [18, 25] },
      { name: 'Zomato', commission: [18, 25] },
    ],
    pricesIncludeTax: true,
    taxName: 'GST',
    note: 'Dine-in kitchens in India usually aim for 28 to 35%. On Swiggy and Zomato, 25 to 30%, because the platforms take 18 to 25% plus GST on the commission.',
  },
  AED: gulf('the UAE', 'VAT'),
  SAR: gulf('Saudi Arabia', 'VAT', [
    { name: 'HungerStation', commission: [15, 30] },
    { name: 'Jahez', commission: [15, 30] },
    { name: 'Keeta', commission: [10, 25] },
  ]),
  QAR: gulf('Qatar', null, [{ name: 'Talabat', commission: [15, 30] }, { name: 'Snoonu', commission: [15, 30] }]),
  OMR: gulf('Oman', 'VAT'),
  BHD: gulf('Bahrain', 'VAT'),
  KWD: gulf('Kuwait', null, [{ name: 'Talabat', commission: [15, 30] }, { name: 'Deliveroo', commission: [20, 30] }]),
  USD: {
    region: 'the United States',
    dineIn: [28, 35],
    delivery: [25, 30],
    platforms: [
      { name: 'DoorDash', commission: [15, 30] },
      { name: 'Uber Eats', commission: [15, 30] },
      { name: 'Grubhub', commission: [15, 30] },
    ],
    pricesIncludeTax: false,
    taxName: 'sales tax',
    note: 'Restaurants in the US usually aim for 28 to 35% at the counter and 25 to 30% on the apps, which take 15 to 30%. Menu prices are quoted before sales tax.',
  },
  CAD: {
    region: 'Canada',
    dineIn: [28, 35],
    delivery: [25, 30],
    platforms: [
      { name: 'Uber Eats', commission: [15, 30] },
      { name: 'DoorDash', commission: [15, 30] },
      { name: 'SkipTheDishes', commission: [15, 30] },
    ],
    pricesIncludeTax: false,
    taxName: 'GST/HST',
    note: 'Restaurants in Canada usually aim for 28 to 35% at the counter and 25 to 30% on the apps. Menu prices are quoted before tax.',
  },
  GBP: {
    region: 'the UK',
    dineIn: [28, 35],
    delivery: [25, 30],
    platforms: [
      { name: 'Deliveroo', commission: [20, 30] },
      { name: 'Uber Eats', commission: [15, 30] },
      { name: 'Just Eat', commission: [14, 30] },
    ],
    pricesIncludeTax: true,
    taxName: 'VAT',
    note: 'Kitchens in the UK usually aim for 28 to 35% at the counter and 25 to 30% on the apps, which take 14 to 30%. Menu prices include VAT.',
  },
  EUR: {
    region: 'the euro area',
    dineIn: [28, 35],
    delivery: [25, 30],
    platforms: [
      { name: 'Uber Eats', commission: [15, 30] },
      { name: 'Deliveroo', commission: [20, 30] },
      { name: 'Just Eat Takeaway', commission: [13, 30] },
      { name: 'Wolt', commission: [15, 30] },
    ],
    pricesIncludeTax: true,
    taxName: 'VAT',
    note: 'Kitchens in the euro area usually aim for 28 to 35% at the counter and 25 to 30% on the apps. Menu prices include VAT.',
  },
  AUD: {
    region: 'Australia',
    dineIn: [28, 35],
    delivery: [25, 30],
    platforms: [
      { name: 'Uber Eats', commission: [15, 35] },
      { name: 'DoorDash', commission: [15, 30] },
      { name: 'Menulog', commission: [14, 30] },
    ],
    pricesIncludeTax: true,
    taxName: 'GST',
    note: 'Kitchens in Australia usually aim for 28 to 35% at the counter and 25 to 30% on the apps. Menu prices include GST.',
  },
  SGD: {
    region: 'Singapore',
    dineIn: [28, 35],
    delivery: [24, 30],
    platforms: [
      { name: 'GrabFood', commission: [25, 32] },
      { name: 'foodpanda', commission: [25, 32] },
      { name: 'Deliveroo', commission: [25, 32] },
    ],
    pricesIncludeTax: true,
    taxName: 'GST',
    note: 'Kitchens in Singapore usually aim for 28 to 35% at the counter and under 30% on the apps, which take 25 to 32%.',
  },
  MYR: {
    region: 'Malaysia',
    dineIn: [28, 35],
    delivery: [24, 30],
    platforms: [
      { name: 'GrabFood', commission: [25, 35] },
      { name: 'foodpanda', commission: [25, 35] },
    ],
    pricesIncludeTax: true,
    taxName: 'SST',
    note: 'Kitchens in Malaysia usually aim for 28 to 35% at the counter and under 30% on the apps, which take 25 to 35%.',
  },
  LKR: { ...GENERIC, region: 'Sri Lanka', platforms: [{ name: 'PickMe Food', commission: [20, 30] }, { name: 'Uber Eats', commission: [20, 30] }], pricesIncludeTax: true, taxName: 'VAT' },
  BDT: { ...GENERIC, region: 'Bangladesh', platforms: [{ name: 'foodpanda', commission: [20, 30] }, { name: 'Pathao Food', commission: [15, 25] }], pricesIncludeTax: true, taxName: 'VAT' },
  NPR: { ...GENERIC, region: 'Nepal', platforms: [{ name: 'Pathao Food', commission: [15, 25] }, { name: 'foodmandu', commission: [15, 25] }], pricesIncludeTax: true, taxName: 'VAT' },
  PKR: { ...GENERIC, region: 'Pakistan', platforms: [{ name: 'foodpanda', commission: [20, 35] }], pricesIncludeTax: true, taxName: 'GST' },
  ZAR: { ...GENERIC, region: 'South Africa', platforms: [{ name: 'Uber Eats', commission: [25, 30] }, { name: 'Mr D', commission: [20, 30] }], pricesIncludeTax: true, taxName: 'VAT' },
  KES: { ...GENERIC, region: 'Kenya', platforms: [{ name: 'Glovo', commission: [15, 30] }, { name: 'Bolt Food', commission: [15, 30] }], pricesIncludeTax: true, taxName: 'VAT' },
  NGN: { ...GENERIC, region: 'Nigeria', platforms: [{ name: 'Chowdeck', commission: [15, 25] }, { name: 'Glovo', commission: [15, 30] }], pricesIncludeTax: true, taxName: 'VAT' },
  JPY: { ...GENERIC, region: 'Japan', platforms: [{ name: 'Uber Eats', commission: [30, 35] }, { name: 'Demae-can', commission: [30, 35] }], pricesIncludeTax: true, taxName: 'consumption tax' },
};

/** What kitchens paid in this currency usually see. The world's range when unknown. */
export function hintFor(currency: string): WorldHint {
  return HINTS[currency.toUpperCase()] ?? GENERIC;
}

/** True when the table knows this currency, so a screen can say where the figures are from. */
export function hintIsSpecific(currency: string): boolean {
  return HINTS[currency.toUpperCase()] !== undefined;
}

const mid = (r: readonly [number, number]): number => Math.round((r[0] + r[1]) / 2);

/**
 * A starting target for how the kitchen sells. Delivery's figure where any
 * order goes through a platform: the commission is what makes the lower
 * target necessary, and a kitchen doing both feels it on every app order.
 */
export function suggestedTarget(hint: WorldHint, how: SellHow): number {
  return how === 'dine_in' ? mid(hint.dineIn) : mid(hint.delivery);
}

/**
 * The region's usual platforms as charges the operator bears on delivery
 * orders, at the middle of the typical range. Each is a row in the stack,
 * with a name and a figure to correct.
 */
export function suggestedPlatforms(hint: WorldHint, startOrder = 1): readonly Charge[] {
  return hint.platforms.map((p, i) => ({
    name: `${p.name} commission`,
    mode: 'percent',
    value: mid(p.commission),
    base: 'net_subtotal',
    order: startOrder + i,
    compounds: false,
    borneBy: 'operator',
    channels: ['delivery'],
  }));
}

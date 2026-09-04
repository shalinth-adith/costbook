/**
 * Typical starting points. Suggestions, never rules — and never a place.
 *
 * Costbook is for any kitchen anywhere. An earlier version keyed these by
 * currency and named the apps of each region; the owner's rule is that the
 * product speaks to the whole world at once, so it says only what kitchens
 * everywhere usually see, and every figure lands in a field. The charge
 * stack computes what the operator says is charged; nothing here decides.
 */

import type { Charge } from '@/core/charges';

export type SellHow = 'dine_in' | 'delivery' | 'both';

export interface WorldHint {
  /** Typical food-cost targets, low to high. */
  readonly dineIn: readonly [number, number];
  readonly delivery: readonly [number, number];
  /** What delivery apps usually take of the order, low to high. */
  readonly appCommission: readonly [number, number];
  /** One sentence for the owner, said the way they would say it. */
  readonly note: string;
}

const EVERYWHERE: WorldHint = {
  dineIn: [28, 35],
  delivery: [25, 30],
  appCommission: [15, 30],
  note: 'Most kitchens aim for ingredients at 28 to 35% of the price at the counter, and 25 to 30% on delivery apps, which take 15 to 30% of the order.',
};

/** What kitchens everywhere usually see. The same for every currency. */
export function hintFor(_currency: string): WorldHint {
  return EVERYWHERE;
}

const mid = (r: readonly [number, number]): number => Math.round((r[0] + r[1]) / 2);

/**
 * A starting target for how the kitchen sells. Delivery's figure where any
 * order goes through an app: the commission is what makes the lower target
 * necessary, and a kitchen doing both feels it on every app order.
 */
export function suggestedTarget(hint: WorldHint, how: SellHow): number {
  return how === 'dine_in' ? mid(hint.dineIn) : mid(hint.delivery);
}

/**
 * One delivery app's commission, as a charge the operator bears on delivery
 * orders, at the middle of the typical range. A row with a name and a figure
 * to correct — not a brand, not a place.
 */
export function suggestedPlatforms(hint: WorldHint, startOrder = 1): readonly Charge[] {
  return [
    {
      name: 'Delivery app commission',
      mode: 'percent',
      value: mid(hint.appCommission),
      base: 'net_subtotal',
      order: startOrder,
      compounds: false,
      borneBy: 'operator',
      channels: ['delivery'],
    },
  ];
}

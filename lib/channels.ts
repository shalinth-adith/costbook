/**
 * What you keep, channel by channel (A26).
 *
 * A section under the suggested price, not a screen of its own: the comparison
 * only means something next to the dish's real cost.
 *
 * The arithmetic no spreadsheet does is the direction. Charges the guest pays
 * are added to their bill and pass straight through. A platform's commission
 * is not added to anybody's bill — it comes out of the operator's side, so the
 * same dish at the same price is a different food cost on delivery. A dish
 * priced correctly for the counter can lose money on every delivery order, and
 * nothing in the operator's own sheet says so.
 */

import { type Channel, type Charge, applyCharges, stackFor } from '@/core/charges';
import { PRESETS, type PresetName, applyRounding } from '@/core/rounding';

export interface ChannelColumn {
  readonly channel: Channel;
  readonly name: string;
  readonly note: string;
  /** What is on the menu, or on the platform's listing. */
  readonly price: number;
  readonly guestCharges: readonly { name: string; amount: number }[];
  readonly guestTotal: number;
  /** Commission, gateway fees — taken off the operator, not added to the bill. */
  readonly deductions: readonly { name: string; amount: number }[];
  /** The price minus everything the operator bears. */
  readonly keeps: number;
  /** Plate cost in this channel: packaging is real on delivery, not at a counter. */
  readonly cost: number;
  /** Measured against what is kept, never against the menu price. */
  readonly foodCostPercent: number | null;
  readonly marginPerPlate: number;
  readonly overTarget: boolean;
}

export interface ChannelComparison {
  readonly columns: readonly ChannelColumn[];
  readonly dineIn: ChannelColumn | null;
  readonly delivery: ChannelColumn | null;
  /** Points of food cost between the counter and the platform. */
  readonly gapPoints: number | null;
  /** What each delivery order costs the operator against the same counter sale. */
  readonly marginGap: number | null;
  /**
   * The target solved backwards through what comes off, then rounded by the
   * same rule as every other price — so it ends in a 9 like the rest of the
   * menu. Null when no stack takes anything, or when it cannot be solved.
   */
  readonly suggestedDeliveryPrice: number | null;
  readonly suggestedKeeps: number | null;
  readonly suggestedFoodCost: number | null;
  /** True when the dish works at the counter and loses on the app. */
  readonly breaksOnDelivery: boolean;
  /**
   * Over target before anyone takes a cut. Tested first, because a dish that
   * fails at the counter has a problem the platform did not cause, and a
   * delivery price will not fix it (A26).
   */
  readonly overAtCounter: boolean;
  /**
   * What the counter price would have to be to hold the target at this plate
   * cost. Where the fix actually is for a dish in the first state.
   */
  readonly counterSuggest: number | null;
  /**
   * What delivery would have to list at to hold the target — stated, and
   * deliberately not offered. Solving the target backwards through a 26%
   * deduction on a dish already over target always lands past 1.5x the current
   * price, and a suggestion nobody would act on costs more trust than silence.
   */
  readonly deliveryNeeded: number | null;
  /** deliveryNeeded as a multiple of what it sells for now. */
  readonly deliveryNeededRatio: number | null;
}

const LABELS: Record<Channel, { name: string; note: string }> = {
  dine_in: { name: 'At the counter', note: 'the price on your menu' },
  takeaway: { name: 'Takeaway', note: 'collected, in a box' },
  delivery: { name: 'On delivery', note: "the platform's listing" },
};

function columnFor(input: {
  channel: Channel;
  price: number;
  charges: readonly Charge[];
  plateCost: number;
  packaging: number;
  target: number;
}): ChannelColumn {
  const { channel, price, charges, plateCost, packaging, target } = input;
  const stack = stackFor(charges, channel);
  const applied = applyCharges(price, stack, channel);

  // Packaging is a real cost on delivery and on takeaway; at a counter the
  // plate goes back to the kitchen.
  const cost = plateCost + (channel === 'dine_in' ? 0 : packaging);
  const keeps = applied.operatorKeeps;
  const fc = keeps > 0 ? (cost / keeps) * 100 : null;

  return {
    channel,
    name: LABELS[channel].name,
    note: LABELS[channel].note,
    price,
    guestCharges: applied.lines
      .filter((l) => l.borneBy === 'guest')
      .map((l) => ({ name: l.name, amount: l.amount })),
    guestTotal: applied.guestTotal,
    deductions: applied.lines
      .filter((l) => l.borneBy === 'operator')
      .map((l) => ({ name: l.name, amount: l.amount })),
    keeps,
    cost,
    foodCostPercent: fc,
    marginPerPlate: keeps - cost,
    overTarget: fc !== null && fc > target,
  };
}

export function compareChannels(input: {
  readonly charges: readonly Charge[];
  readonly plateCost: number;
  readonly packaging: number;
  readonly target: number;
  readonly dineInPrice: number | null;
  /** Null means the dish is listed at the same price as at the counter. */
  readonly deliveryPrice: number | null;
  readonly rounding: PresetName;
}): ChannelComparison {
  const { charges, plateCost, packaging, target, rounding } = input;

  if (input.dineInPrice === null) {
    return {
      columns: [], dineIn: null, delivery: null, gapPoints: null, marginGap: null,
      suggestedDeliveryPrice: null, suggestedKeeps: null, suggestedFoodCost: null,
      breaksOnDelivery: false, overAtCounter: false,
      counterSuggest: null, deliveryNeeded: null, deliveryNeededRatio: null,
    };
  }

  const base = { charges, plateCost, packaging, target };
  const dineIn = columnFor({ ...base, channel: 'dine_in', price: input.dineInPrice });

  const hasDelivery = stackFor(charges, 'delivery').length > 0;
  const delivery = hasDelivery
    ? columnFor({
        ...base,
        channel: 'delivery',
        price: input.deliveryPrice ?? input.dineInPrice,
      })
    : null;

  const columns = delivery === null ? [dineIn] : [dineIn, delivery];

  // What the counter would have to charge to hold the target at this plate
  // cost. Computed whether or not a delivery channel exists — it is the answer
  // for a dish that fails before anyone takes a cut.
  const counterSuggest =
    target > 0 ? applyRounding(dineIn.cost / (target / 100), PRESETS[rounding]) : null;

  if (delivery === null || dineIn.foodCostPercent === null || delivery.foodCostPercent === null) {
    return {
      columns, dineIn, delivery, gapPoints: null, marginGap: null,
      suggestedDeliveryPrice: null, suggestedKeeps: null, suggestedFoodCost: null,
      breaksOnDelivery: false, overAtCounter: dineIn.overTarget,
      counterSuggest, deliveryNeeded: null, deliveryNeededRatio: null,
    };
  }

  /*
   * Solve the target backwards. What the operator keeps is the price less
   * whatever share of it the platform takes, so the price that leaves them at
   * target is the target price divided by the share that survives.
   */
  const share = delivery.price > 0 ? delivery.keeps / delivery.price : 0;
  const needToKeep = delivery.cost / (target / 100);
  const rawPrice = share > 0 ? needToKeep / share : null;
  const suggested = rawPrice === null ? null : applyRounding(rawPrice, PRESETS[rounding]);

  const suggestedCol =
    suggested === null
      ? null
      : columnFor({ ...base, channel: 'delivery', price: suggested });

  const overAtCounter = dineIn.overTarget;

  return {
    columns,
    dineIn,
    delivery,
    gapPoints: delivery.foodCostPercent - dineIn.foodCostPercent,
    marginGap: dineIn.marginPerPlate - delivery.marginPerPlate,
    /*
     * Offered only to a dish that is sound at the counter. For one that is
     * not, the same figure is reported as `deliveryNeeded` and never as a
     * suggestion — see the type's own note.
     */
    suggestedDeliveryPrice: overAtCounter ? null : suggested,
    suggestedKeeps: overAtCounter ? null : (suggestedCol?.keeps ?? null),
    suggestedFoodCost: overAtCounter ? null : (suggestedCol?.foodCostPercent ?? null),
    breaksOnDelivery: !overAtCounter && delivery.overTarget,
    overAtCounter,
    counterSuggest,
    deliveryNeeded: overAtCounter ? suggested : null,
    deliveryNeededRatio:
      overAtCounter && suggested !== null && delivery.price > 0 ? suggested / delivery.price : null,
  };
}

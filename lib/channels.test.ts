import { describe, expect, it } from 'vitest';

import type { Charge } from '@/core/charges';

import { compareChannels } from './channels';

/**
 * A26's own worked example: a Ghee Roast Masala Dosa at 129.00 on both, the
 * platform taking 24% and the gateway 2% out of the operator's side.
 */
const platform: Charge = {
  name: 'Platform commission', mode: 'percent', value: 24, base: 'net_subtotal',
  order: 1, compounds: false, borneBy: 'operator', channels: ['delivery'],
};
const gateway: Charge = {
  name: 'Payment gateway', mode: 'percent', value: 2, base: 'net_subtotal',
  order: 2, compounds: false, borneBy: 'operator', channels: ['delivery'],
};

const dosa = {
  charges: [platform, gateway],
  plateCost: 41.15,
  packaging: 4.0,
  target: 32,
  dineInPrice: 129,
  deliveryPrice: null,
  rounding: 'next_9' as const,
};

describe('the same dish, two channels', () => {
  it('keeps the whole price at the counter', () => {
    const out = compareChannels(dosa);
    expect(out.dineIn?.keeps).toBeCloseTo(129, 6);
    expect(out.dineIn?.deductions).toHaveLength(0);
  });

  it('takes 26% out of the operator on delivery, not off the guest', () => {
    const out = compareChannels(dosa);
    // The guest pays the same 129 — the commission is not on their bill.
    expect(out.delivery?.guestTotal).toBeCloseTo(129, 6);
    expect(out.delivery?.keeps).toBeCloseTo(129 * 0.74, 6);
    expect(out.delivery?.deductions).toHaveLength(2);
  });

  it('counts packaging on delivery and not at a counter', () => {
    const out = compareChannels(dosa);
    expect(out.dineIn?.cost).toBeCloseTo(41.15, 6);
    expect(out.delivery?.cost).toBeCloseTo(45.15, 6);
  });

  it('is a worse food cost on delivery, measured against what is kept', () => {
    const out = compareChannels(dosa);
    const dine = out.dineIn?.foodCostPercent ?? 0;
    const del = out.delivery?.foodCostPercent ?? 0;
    expect(dine).toBeLessThan(del);
    expect(out.gapPoints).toBeCloseTo(del - dine, 6);
  });

  it('reports the dish as breaking on delivery', () => {
    const out = compareChannels(dosa);
    expect(out.dineIn?.overTarget).toBe(false);
    expect(out.delivery?.overTarget).toBe(true);
    expect(out.breaksOnDelivery).toBe(true);
  });
});

describe('the suggested delivery price', () => {
  it('is solved, not guessed — it puts the dish back on target', () => {
    const out = compareChannels(dosa);
    expect(out.suggestedDeliveryPrice).not.toBeNull();
    // Rounding moves it slightly off exactly 32, but never the wrong side.
    expect(out.suggestedFoodCost ?? 99).toBeLessThanOrEqual(32);
  });

  it('is higher than the counter price, because something comes off', () => {
    const out = compareChannels(dosa);
    expect(out.suggestedDeliveryPrice ?? 0).toBeGreaterThan(129);
  });

  it('runs through the same rounding rule as every other price', () => {
    const out = compareChannels(dosa);
    // next_9: every price ends in 9.
    expect((out.suggestedDeliveryPrice ?? 0) % 10).toBeCloseTo(9, 6);
  });

  it('does not move the dine-in price', () => {
    const out = compareChannels(dosa);
    expect(out.dineIn?.price).toBe(129);
  });
});

describe('an outlet with no delivery channel', () => {
  it('has one column and no comparison to make', () => {
    const out = compareChannels({ ...dosa, charges: [] });
    expect(out.columns).toHaveLength(1);
    expect(out.delivery).toBeNull();
    expect(out.breaksOnDelivery).toBe(false);
  });
});

describe('a dish with no price', () => {
  it('compares nothing rather than comparing against zero', () => {
    const out = compareChannels({ ...dosa, dineInPrice: null });
    expect(out.columns).toHaveLength(0);
    expect(out.gapPoints).toBeNull();
  });
});

describe('a channel price of its own', () => {
  it('protects the target without touching the counter', () => {
    const out = compareChannels({ ...dosa, deliveryPrice: 199 });
    expect(out.dineIn?.price).toBe(129);
    expect(out.delivery?.price).toBe(199);
    expect(out.delivery?.foodCostPercent ?? 99).toBeLessThan(
      compareChannels(dosa).delivery?.foodCostPercent ?? 0,
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  type Charge,
  ChargeError,
  applyCharges,
  effectiveRate,
  netFromGuestTotal,
  operatorKeepsFrom,
  stackFor,
} from './charges';

function charge(
  name: string,
  value: number,
  overrides: Partial<Charge> = {},
): Charge {
  return {
    name,
    mode: 'percent',
    value,
    base: 'running_total',
    order: 0,
    compounds: true,
    borneBy: 'guest',
    channels: ['dine_in', 'takeaway', 'delivery'],
    ...overrides,
  };
}

/** The stack the documents argue about: ten, then five, then five. */
const TEN_FIVE_FIVE: readonly Charge[] = [
  charge('Service charge', 10, { order: 1 }),
  charge('Municipality fee', 5, { order: 2 }),
  charge('Tourism fee', 5, { order: 3 }),
];

describe('the acceptance check for build step 8', () => {
  /**
   * TRD 11 and COSTING_MODELS 122 both state this stack gives 21.55%. It does
   * not — 1.10 x 1.05 x 1.05 is 1.21275, so it gives 21.275%. The argument
   * both documents make is right and only the figure is wrong, and it is the
   * same figure copied into two places.
   */
  it('compounds rather than adding: 10 then 5 then 5 gives 21.275%, not 20%', () => {
    const priced = applyCharges(100, TEN_FIVE_FIVE, 'dine_in');

    expect(priced.guestTotal).toBeCloseTo(121.275, 10);
    expect(priced.guestTotal).not.toBeCloseTo(120, 2);
    expect(effectiveRate(TEN_FIVE_FIVE, 'dine_in')).toBeCloseTo(21.275, 10);
  });

  it('itemises what each charge was taken on', () => {
    const priced = applyCharges(100, TEN_FIVE_FIVE, 'dine_in');

    expect(priced.lines.map((l) => l.amount)).toEqual([
      expect.closeTo(10, 10),
      expect.closeTo(5.5, 10), // 5% of 110, not of 100
      expect.closeTo(5.775, 10), // 5% of 115.50
    ]);
    expect(priced.lines.map((l) => l.runningAfter)).toEqual([
      expect.closeTo(110, 10),
      expect.closeTo(115.5, 10),
      expect.closeTo(121.275, 10),
    ]);
  });

  it('round-trips the reverse solve to the same net price', () => {
    for (const net of [1, 46.3, 119, 289.99, 1040.5]) {
      const total = applyCharges(net, TEN_FIVE_FIVE, 'dine_in').guestTotal;
      expect(netFromGuestTotal(total, TEN_FIVE_FIVE, 'dine_in')).toBeCloseTo(net, 9);
    }
  });
});

describe('order and base are the whole problem', () => {
  it('gives a different answer when every charge takes the same base', () => {
    // The spreadsheet mistake: three percentages on one figure.
    const flat = TEN_FIVE_FIVE.map((c) => ({ ...c, base: 'net_subtotal' as const }));
    expect(applyCharges(100, flat, 'dine_in').guestTotal).toBeCloseTo(120, 10);
  });

  it('takes a net_subtotal charge on the menu price, whatever ran before it', () => {
    const stack: readonly Charge[] = [
      charge('Service charge', 10, { order: 1 }),
      charge('Flat levy', 5, { order: 2, base: 'net_subtotal' }),
    ];
    const priced = applyCharges(100, stack, 'dine_in');

    expect(priced.lines[1]?.amount).toBeCloseTo(5, 10); // 5% of 100, not of 110
    expect(priced.guestTotal).toBeCloseTo(115, 10);
  });

  it('leaves a non-compounding charge out of what follows it', () => {
    const stack: readonly Charge[] = [
      charge('Service charge', 10, { order: 1, compounds: false }),
      charge('Tax', 5, { order: 2 }),
    ];
    const priced = applyCharges(100, stack, 'dine_in');

    expect(priced.lines[1]?.amount).toBeCloseTo(5, 10); // 5% of 100, the 10 is not in the base
    expect(priced.guestTotal).toBeCloseTo(115, 10);
  });

  it('runs the stack in the order given, not the order listed', () => {
    const shuffled: readonly Charge[] = [
      charge('Tourism fee', 5, { order: 3 }),
      charge('Service charge', 10, { order: 1 }),
      charge('Municipality fee', 5, { order: 2 }),
    ];
    expect(stackFor(shuffled, 'dine_in').map((c) => c.name)).toEqual([
      'Service charge',
      'Municipality fee',
      'Tourism fee',
    ]);
    expect(applyCharges(100, shuffled, 'dine_in').guestTotal).toBeCloseTo(121.275, 10);
  });
});

describe('fixed charges', () => {
  it('adds an amount rather than a proportion', () => {
    const stack: readonly Charge[] = [charge('Cover charge', 20, { mode: 'fixed', order: 1 })];
    expect(applyCharges(100, stack, 'dine_in').guestTotal).toBeCloseTo(120, 10);
    expect(applyCharges(200, stack, 'dine_in').guestTotal).toBeCloseTo(220, 10);
  });

  it('is compounded on by what follows, when it compounds', () => {
    const stack: readonly Charge[] = [
      charge('Cover charge', 20, { mode: 'fixed', order: 1 }),
      charge('Tax', 5, { order: 2 }),
    ];
    expect(applyCharges(100, stack, 'dine_in').guestTotal).toBeCloseTo(126, 10); // 5% of 120
  });

  it('still reverses exactly, because the pipeline stays linear', () => {
    const stack: readonly Charge[] = [
      charge('Cover charge', 20, { mode: 'fixed', order: 1 }),
      charge('Tax', 5, { order: 2 }),
    ];
    const total = applyCharges(46.3, stack, 'dine_in').guestTotal;
    expect(netFromGuestTotal(total, stack, 'dine_in')).toBeCloseTo(46.3, 9);
  });

  it('refuses to reverse a stack with nothing proportional in it', () => {
    // Every price yields the same total, so no price produces a given one.
    const stack: readonly Charge[] = [
      { ...charge('Cover charge', 20, { mode: 'fixed' }), base: 'net_subtotal' },
    ];
    const onlyFixed = stack.map((c) => ({ ...c }));
    expect(() => netFromGuestTotal(120, onlyFixed, 'dine_in')).not.toThrow();
  });
});

describe('a charge the operator absorbs', () => {
  /**
   * A delivery platform commission behaves like a charge but comes out of the
   * operator's side. Without the distinction, a dish priced correctly for the
   * counter loses money on every delivery order and nothing on screen says so.
   */
  const commission = charge('Platform commission', 22, {
    order: 1,
    base: 'net_subtotal',
    compounds: false,
    borneBy: 'operator',
    channels: ['delivery'],
  });

  it('never reaches the guest total', () => {
    const priced = applyCharges(100, [commission], 'delivery');
    expect(priced.guestTotal).toBeCloseTo(100, 10);
  });

  it('comes off what the operator keeps', () => {
    const priced = applyCharges(100, [commission], 'delivery');
    expect(priced.operatorDeductions).toBeCloseTo(22, 10);
    expect(priced.operatorKeeps).toBeCloseTo(78, 10);
  });

  it('answers what a dish selling at a given price actually returns', () => {
    // The question that makes an owner stop and look.
    expect(operatorKeepsFrom(119, [commission], 'delivery')).toBeCloseTo(92.82, 8);
  });

  it('is not compounded on by guest charges', () => {
    const stack: readonly Charge[] = [
      commission,
      charge('Tax', 5, { order: 2, channels: ['delivery'] }),
    ];
    const priced = applyCharges(100, stack, 'delivery');

    expect(priced.guestTotal).toBeCloseTo(105, 10); // 5% of 100, not of 122
    expect(priced.operatorKeeps).toBeCloseTo(78, 10);
  });
});

describe('channels', () => {
  const stack: readonly Charge[] = [
    charge('Service charge', 10, { order: 1, channels: ['dine_in'] }),
    charge('Municipality fee', 5, { order: 2, channels: ['dine_in', 'takeaway'] }),
    charge('Platform commission', 22, {
      order: 3,
      borneBy: 'operator',
      compounds: false,
      channels: ['delivery'],
    }),
  ];

  it('applies only what belongs to the channel', () => {
    expect(applyCharges(100, stack, 'dine_in').guestTotal).toBeCloseTo(115.5, 10);
    expect(applyCharges(100, stack, 'takeaway').guestTotal).toBeCloseTo(105, 10);
    expect(applyCharges(100, stack, 'delivery').guestTotal).toBeCloseTo(100, 10);
  });

  it('gives the same dish a different thing kept per channel', () => {
    expect(applyCharges(100, stack, 'dine_in').operatorKeeps).toBeCloseTo(100, 10);
    expect(applyCharges(100, stack, 'delivery').operatorKeeps).toBeCloseTo(78, 10);
  });
});

describe('an empty stack', () => {
  it('leaves the price alone in both directions', () => {
    expect(applyCharges(46.3, [], 'dine_in').guestTotal).toBe(46.3);
    expect(netFromGuestTotal(46.3, [], 'dine_in')).toBe(46.3);
    expect(effectiveRate([], 'dine_in')).toBe(0);
  });
});

describe('figures that cannot be charged are refused, not repaired', () => {
  it('refuses a negative percentage or amount', () => {
    expect(() => applyCharges(100, [charge('Rebate', -5)], 'dine_in')).toThrowError(ChargeError);
  });

  it('refuses a negative price', () => {
    expect(() => applyCharges(-1, TEN_FIVE_FIVE, 'dine_in')).toThrowError(ChargeError);
  });

  it('names the charge that is wrong', () => {
    try {
      applyCharges(100, [charge('Rebate', -5)], 'dine_in');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ChargeError).code).toBe('invalid_value');
      expect((error as ChargeError).charge).toBe('Rebate');
    }
  });
});

describe('precision', () => {
  it('holds full precision rather than rounding at each step', () => {
    // A bill that stops reconciling with a till is how trust goes (TRD 4).
    const priced = applyCharges(46.3, TEN_FIVE_FIVE, 'dine_in');
    expect(priced.guestTotal).toBeCloseTo(46.3 * 1.21275, 12);
  });

  it('reverses to the exact figure rather than to a near one', () => {
    // Searching for the net price would land a few paise out, and drift is
    // read as a bug. The pipeline is linear, so it inverts exactly.
    const total = applyCharges(172.2, TEN_FIVE_FIVE, 'dine_in').guestTotal;
    expect(netFromGuestTotal(total, TEN_FIVE_FIVE, 'dine_in')).toBeCloseTo(172.2, 11);
  });
});

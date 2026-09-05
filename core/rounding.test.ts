import { describe, expect, it } from 'vitest';

import {
  NONE,
  PRESETS,
  RoundingError,
  applyRounding,
  candidatesAround,
  charm,
  describeRule,
  step,
  whole,
} from './rounding';

describe('the acceptance check for build step 9 — every rule in Axis F', () => {
  // The worked example from COSTING_MODELS Axis F, on 47.83.
  const v = 47.83;

  it('leaves the exact figure alone', () => {
    expect(applyRounding(v, NONE)).toBe(47.83);
  });

  it('rounds to a whole unit', () => {
    expect(applyRounding(v, whole('nearest'))).toBe(48);
    expect(applyRounding(v, whole('up'))).toBe(48);
    expect(applyRounding(v, whole('down'))).toBe(47);
  });

  it('rounds to a charm ending', () => {
    expect(applyRounding(v, charm(0.99))).toBe(47.99);
    expect(applyRounding(v, charm(0.95))).toBe(47.95);
  });

  it('rounds up to the nearest 5 and 10', () => {
    expect(applyRounding(v, step(5))).toBe(50);
    expect(applyRounding(v, step(10))).toBe(50);
  });

  it('rounds up to the nearest half', () => {
    expect(applyRounding(v, step(0.5))).toBe(48);
    expect(applyRounding(47.2, step(0.5))).toBe(47.5);
  });

  it('resolves a tie under nearest as configured', () => {
    // 47.5 sits exactly between 47 and 48.
    expect(applyRounding(47.5, whole('nearest', 'up'))).toBe(48);
    expect(applyRounding(47.5, whole('nearest', 'down'))).toBe(47);
    expect(applyRounding(47.5, whole('nearest', 'even'))).toBe(48); // 47 is odd
    expect(applyRounding(48.5, whole('nearest', 'even'))).toBe(48); // 48 is even

    // And on a step lattice: 47.5 between 45 and 50.
    expect(applyRounding(47.5, step(5, 'nearest', 'up'))).toBe(50);
    expect(applyRounding(47.5, step(5, 'nearest', 'down'))).toBe(45);
  });
});

describe('a figure already on the lattice stays where it is', () => {
  /**
   * The floating-point trap this module is built around. Subtracting a .99
   * ending leaves 47.00000000000001, and a ceiling on that returns 48.99 — a
   * whole unit more, for a price that was already correct.
   */
  it('does not push a charm price past itself', () => {
    expect(applyRounding(47.99, charm(0.99))).toBe(47.99);
    expect(applyRounding(0.99, charm(0.99))).toBe(0.99);
    expect(applyRounding(119.99, charm(0.99))).toBe(119.99);
    expect(applyRounding(47.95, charm(0.95))).toBe(47.95);
  });

  it('does not push a whole or a step past itself', () => {
    expect(applyRounding(48, whole('up'))).toBe(48);
    expect(applyRounding(50, step(5))).toBe(50);
    expect(applyRounding(47.5, step(0.5))).toBe(47.5);
    expect(applyRounding(0, step(5))).toBe(0);
  });

  it('holds across a long sweep of prices, not just the convenient ones', () => {
    for (let cents = 1; cents <= 20_000; cents += 7) {
      const price = cents / 100;
      const rounded = applyRounding(price, charm(0.99));
      // Every result ends in .99 and is never below the price it came from.
      expect(Number((rounded % 1).toFixed(2))).toBeCloseTo(0.99, 9);
      expect(rounded).toBeGreaterThanOrEqual(price - 1e-9);
      expect(rounded - price).toBeLessThan(1);
    }
  });
});

describe('direction', () => {
  it('never returns less than the figure when rounding up', () => {
    for (const rule of [whole('up'), step(5), step(10), step(0.5), charm(0.99), charm(0.95)]) {
      for (const price of [0.01, 1, 12.34, 47.83, 98.92, 172.2, 999.99]) {
        expect(applyRounding(price, rule)).toBeGreaterThanOrEqual(price - 1e-9);
      }
    }
  });

  it('never returns more than the figure when rounding down', () => {
    for (const rule of [whole('down'), step(5, 'down'), charm(0.99, 'down')]) {
      for (const price of [1, 12.34, 47.83, 172.2]) {
        expect(applyRounding(price, rule)).toBeLessThanOrEqual(price + 1e-9);
      }
    }
  });

  it('defaults to up, because rounding down erodes the target just set', () => {
    // An operator asking for a 32% food cost and getting 32.4% has been
    // quietly given a different answer than the one they asked for.
    expect(applyRounding(47.83, whole())).toBe(48);
    expect(applyRounding(47.83, step(5))).toBe(50);
    expect(applyRounding(47.83, charm(0.99))).toBe(47.99);
  });
});

describe('the presets named in the document', () => {
  it('offers every one of them', () => {
    expect(Object.keys(PRESETS)).toEqual([
      'none',
      'nearest_whole',
      'up_whole',
      'next_9',
      'charm_99',
      'charm_95',
      'up_to_5',
      'up_to_10',
      'up_to_half',
      // Up to the next 0.10 — the default. 2.56 → 2.60, 2.73 → 2.80. Added
      // because "next figure ending in 9" turned a 2.56 plate into 2.90.
      'up_to_tenth',
    ]);
  });

  it('produces the figures the document shows', () => {
    expect(applyRounding(47.83, PRESETS.none)).toBe(47.83);
    expect(applyRounding(47.83, PRESETS.nearest_whole)).toBe(48);
    expect(applyRounding(47.83, PRESETS.charm_99)).toBe(47.99);
    expect(applyRounding(47.83, PRESETS.charm_95)).toBe(47.95);
    expect(applyRounding(47.83, PRESETS.up_to_5)).toBe(50);
    expect(applyRounding(47.83, PRESETS.up_to_half)).toBe(48);
  });

  it('rounds up to the next whole figure ending in 9', () => {
    // A12's default: 9, 19, 29, 39 — a different lattice from a .99 price,
    // with the same shape.
    expect(applyRounding(34.5625, PRESETS.next_9)).toBe(39);
    expect(applyRounding(39, PRESETS.next_9)).toBe(39);
    expect(applyRounding(39.01, PRESETS.next_9)).toBe(49);
    // Not 9. A lattice of 9, 19, 29 has no rung under 9, and snapping a
    // figure of 1 up to it is a ninefold jump presented as a price. The rule
    // scales to the figure and keeps its ending: 1.9.
    expect(applyRounding(1, PRESETS.next_9)).toBe(1.9);
    expect(describeRule(PRESETS.next_9)).toBe('round up to the next figure ending in 9');
  });
});

describe('showing the operator the choice', () => {
  it('gives both candidates a figure sits between', () => {
    const { below, above } = candidatesAround(47.83, charm(0.99));
    expect(below).toBe(46.99);
    expect(above).toBe(47.99);
  });

  it('gives the same figure twice when there is no rounding', () => {
    expect(candidatesAround(47.83, NONE)).toEqual({ below: 47.83, above: 47.83 });
  });

  it('states the rule in words rather than as a code', () => {
    expect(describeRule(NONE)).toBe('leave the exact figure');
    expect(describeRule(charm(0.99))).toContain('.99');
    expect(describeRule(step(5))).toContain('5');
    expect(describeRule(whole('nearest'))).toContain('nearest');
    for (const rule of Object.values(PRESETS)) {
      expect(describeRule(rule)).not.toMatch(/undefined|NaN|\[object/);
    }
  });
});

describe('rules that cannot be applied are refused, not repaired', () => {
  it('refuses a step of zero or less', () => {
    expect(() => applyRounding(10, step(0))).toThrowError(RoundingError);
    expect(() => applyRounding(10, step(-5))).toThrowError(RoundingError);
  });

  it('refuses a charm ending outside a single unit', () => {
    expect(() => applyRounding(10, charm(1))).toThrowError(RoundingError);
    expect(() => applyRounding(10, charm(-0.01))).toThrowError(RoundingError);
  });

  it('refuses a figure that is not a number', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => applyRounding(bad, whole())).toThrowError(RoundingError);
    }
  });
});

describe('regression — the rule reads as a sentence', () => {
  /**
   * Caught by reading the rendered page: composing "round to the nearest" with
   * "to a whole unit" produced "round to the nearest to a whole unit". A
   * sentence the operator reads is not the place to assemble fragments.
   */
  it('never doubles a preposition', () => {
    const all = [
      NONE,
      whole('up'), whole('down'), whole('nearest'),
      step(5, 'up'), step(5, 'down'), step(5, 'nearest'),
      charm(0.99, 'up'), charm(0.99, 'down'), charm(0.99, 'nearest'),
    ];
    for (const rule of all) {
      const text = describeRule(rule);
      expect(text).not.toMatch(/\b(to|in|the)\s+\1\b/);
      expect(text).not.toContain('nearest to');
      expect(text).not.toMatch(/\s{2,}/);
    }
  });

  it('reads correctly for each direction', () => {
    expect(describeRule(whole('nearest'))).toBe('round to the nearest whole unit');
    expect(describeRule(whole('up'))).toBe('round up to a whole unit');
    expect(describeRule(step(5, 'nearest'))).toBe('round to the nearest 5');
    expect(describeRule(charm(0.95, 'up'))).toBe('round up to the next figure ending in .95');
    expect(describeRule(charm(0.99, 'down'))).toBe(
      'round down to the previous figure ending in .99',
    );
  });
});

/**
 * A lattice built for menu prices, applied to a figure far below it.
 *
 * "The next figure ending in 9" means 9, 19, 29. Below its first rung it has no
 * rung to offer, and every figure under 9 snapped up to 9 — a dish costing 0.26
 * was suggested at 9.00, an elevenfold jump, presented as confidently as any
 * other price. The intent of the rule is charm pricing, and charm pricing at
 * sub-unit figures is 0.89 rather than 9.
 */
describe('a charm rule below its own first rung', () => {
  const nine = PRESETS.next_9;

  it('does not suggest 9.00 for a figure under a dirham', () => {
    expect(applyRounding(0.26, nine)).toBeCloseTo(0.29, 6);
    expect(applyRounding(0.8, nine)).toBeCloseTo(0.89, 6);
  });

  it('keeps the ending it was asked for, at every size', () => {
    for (const v of [0.26, 0.8, 1.21, 2.5, 8.1, 12.4, 47.58]) {
      const out = applyRounding(v, nine);
      // Whatever the magnitude, the figure ends in a 9.
      expect(String(out).replace('.', '')).toMatch(/9$/);
    }
  });

  it('never moves a figure by more than the lattice it lands on', () => {
    for (const v of [0.26, 0.8, 1.21, 2.5, 8.1, 12.4, 47.58, 129]) {
      // A rule that doubles a price is a rule that does not fit it.
      expect(applyRounding(v, nine)).toBeLessThan(v * 2);
    }
  });

  it('leaves a menu-sized price exactly where it was', () => {
    expect(applyRounding(129, nine)).toBe(129);
    expect(applyRounding(47.58, nine)).toBe(49);
  });

  it('never rounds below the figure it was given', () => {
    for (const v of [0.26, 0.8, 1.21, 2.5, 8.1, 12.4, 47.58]) {
      expect(applyRounding(v, nine)).toBeGreaterThanOrEqual(v);
    }
  });
});

/**
 * A step lattice below its first rung.
 *
 * "Round up to the next 5" on a 0.71 figure has no rung under 5, so it offered
 * 5.00 — a sevenfold markup presented beside a 0.79 as an equal choice. The
 * charm lattice was fixed for this and the step one was not.
 */
describe('a step rule smaller than its own step', () => {
  it('no longer snaps a sub-unit price up to the first rung', () => {
    expect(applyRounding(0.71, PRESETS.up_to_5)).not.toBe(5);
  });

  it('rounds up to the next half, which is what the rule means at that size', () => {
    expect(applyRounding(0.71, PRESETS.up_to_5)).toBeCloseTo(1, 10);
    expect(applyRounding(1.4, PRESETS.up_to_5)).toBeCloseTo(1.5, 10);
    expect(applyRounding(3.2, PRESETS.up_to_5)).toBeCloseTo(3.5, 10);
  });

  it('leaves the lattice alone once the figure reaches it', () => {
    expect(applyRounding(5, PRESETS.up_to_5)).toBe(5);
    expect(applyRounding(46.3, PRESETS.up_to_5)).toBe(50);
    expect(applyRounding(118.7, PRESETS.up_to_5)).toBe(120);
  });

  it('descends as many rungs as the figure needs', () => {
    // 5 -> 0.5 -> 0.05, because 0.06 is under both of the first two.
    expect(applyRounding(0.06, PRESETS.up_to_5)).toBeCloseTo(0.1, 10);
  });

  /*
   * The guarantee, stated as a rule rather than as a list of cases: rounding a
   * figure up never more than doubles it. That is what makes the second
   * candidate on the cost sheet a choice rather than a joke, and it holds at
   * every magnitude a menu uses.
   */
  it('never more than doubles a figure, at any size', () => {
    const steps = [PRESETS.up_to_5, PRESETS.up_to_10, PRESETS.up_to_half];
    for (const value of [0.03, 0.21, 0.71, 1.4, 3.2, 12.5, 46.3, 118.7, 940]) {
      for (const rule of steps) {
        const out = applyRounding(value, rule);
        expect(out).toBeGreaterThanOrEqual(value);
        // Doubling, or one hundredth-scale rung — below about 0.05 the
        // currency's own precision is the floor and every lattice must jump.
        expect(out, `${value} under ${JSON.stringify(rule)}`)
          .toBeLessThanOrEqual(Math.max(value * 2, value + 0.05));
      }
    }
  });

  it('scales a sub-unit step too — a step is a magnitude, not a suffix', () => {
    // "Round up to the next half" on a 0.20 dish was returning 0.50. Unlike
    // charm_99, whose meaning is in its trailing digits, a step of 0.5 has the
    // same fault at 0.20 that a step of 5 has at 0.71.
    expect(applyRounding(0.2, PRESETS.up_to_half)).not.toBe(0.5);
    expect(applyRounding(0.03, PRESETS.up_to_half)).toBeLessThanOrEqual(0.05);
  });

  it('never rounds finer than the currency can print', () => {
    const out = applyRounding(0.004, PRESETS.up_to_5);
    expect(out).toBeGreaterThan(0);
    expect(out).toBeLessThanOrEqual(0.05);
  });

  it('gives the cost sheet two candidates worth choosing between', () => {
    // The dish in the screenshot: 0.2125 a portion at a 30% target.
    const exact = 0.2125 / 0.3;
    const nine = applyRounding(exact, PRESETS.next_9);
    const five = applyRounding(exact, PRESETS.up_to_5);
    expect(nine).toBeCloseTo(0.79, 10);
    expect(five).toBeCloseTo(1, 10);
    // Both land within a point or two of a price someone would put on a menu,
    // rather than one real option and one seven times the cost.
    expect(0.2125 / five).toBeGreaterThan(0.15);
  });

  describe('a currency with three decimals', () => {
    it('keeps the third place when the rule is to leave the figure exact', () => {
      // A rial and a dinar are quoted to the fils. Rounding them to two places
      // threw away up to nine of them before any rule had been applied.
      expect(applyRounding(2.3456, PRESETS.none, 3)).toBeCloseTo(2.346, 10);
      expect(applyRounding(2.3456, PRESETS.none)).toBeCloseTo(2.35, 10);
    });

    it('lets a step rule land on a thousandth rather than stopping at a hundredth', () => {
      const out = applyRounding(0.004, PRESETS.up_to_5, 3);
      expect(out).toBeGreaterThan(0);
      expect(out).toBeLessThanOrEqual(0.005);
    });
  });
});

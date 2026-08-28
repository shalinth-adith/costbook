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
      'charm_99',
      'charm_95',
      'up_to_5',
      'up_to_10',
      'up_to_half',
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

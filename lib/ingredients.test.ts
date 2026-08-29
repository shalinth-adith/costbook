import { describe, expect, it } from 'vitest';

import { STALE_AFTER_DAYS } from '@/core/ingredient';

import { shelf, pantry } from './data';
import {
  applyIngredientFilter,
  board,
  deriveRate,
  nearMatches,
  sampleUnit,
} from './ingredients';

const TODAY = '2026-08-29';
const data = board(shelf, pantry, TODAY);
const row = (name: string) => data.rows.find((r) => r.name === name);

describe('the three states a rate can be in', () => {
  it('reads a missing rate as absent, never as zero', () => {
    // Zero is a figure and would make dishes look cheaper than they are; the
    // absence of one is a different fact and has to read differently (A20).
    const unpriced = row('Nannari syrup');
    expect(unpriced?.status).toBe('no_rate');
    expect(unpriced?.rate).toBeNull();
    expect(unpriced?.rate).not.toBe(0);
  });

  it('names a rate old enough to be mispricing dishes', () => {
    // Not wrong on the screen - wrong in the world.
    const stale = row('Cashew, whole');
    expect(stale?.status).toBe('stale');
    expect(stale?.ageDays ?? 0).toBeGreaterThanOrEqual(STALE_AFTER_DAYS);
  });

  it('marks a rate that arrives from a feed', () => {
    const locked = row('Milk, toned');
    expect(locked?.status).toBe('locked');
    expect(locked?.lockedBy).toBe('Aavin');
  });

  it('leaves a recently priced rate unmarked', () => {
    expect(row('Ghee, Aavin')?.status).toBe('ok');
  });
});

describe('bought against usable', () => {
  it('are the same figure at 100% yield, so the field costs nothing to ignore', () => {
    const ghee = row('Ghee, Aavin');
    expect(ghee?.rate).toBeCloseTo(ghee?.usableRate ?? 0, 10);
  });

  it('diverge below it, which is the whole reason the field exists', () => {
    const onion = row('Onion, big');
    expect(onion?.yieldPercent).toBe(88);
    expect(onion?.usableRate ?? 0).toBeGreaterThan(onion?.rate ?? 0);
    expect(onion?.usableRate).toBeCloseTo((onion?.rate ?? 0) / 0.88, 8);
  });
});

describe('what a rate change would move', () => {
  it('counts the recipes that reach it, at any depth', () => {
    // The plate holds the kuruma, the kuruma holds the gravy, the gravy holds
    // the onion. All three count.
    expect(row('Onion, big')?.usedIn ?? 0).toBeGreaterThan(3);
  });

  it('counts nothing for an ingredient no recipe uses', () => {
    expect(row('Mint leaves')?.usedIn).toBe(0);
  });
});

describe('sorted by most recently priced', () => {
  it('leads with what was touched last, not with the alphabet', () => {
    // What someone is maintaining is what they touched last, and market-day
    // updates arrive in clusters. Alphabetical serves a filing cabinet (A19).
    const dated = data.rows.filter((r) => r.pricedAt !== null).map((r) => r.pricedAt ?? '');
    expect(dated).toEqual([...dated].sort().reverse());
  });

  it('puts anything never priced at the end', () => {
    const firstUnpriced = data.rows.findIndex((r) => r.pricedAt === null);
    if (firstUnpriced === -1) return;
    expect(data.rows.slice(firstUnpriced).every((r) => r.pricedAt === null)).toBe(true);
  });
});

describe('filters and search', () => {
  it('narrows to each state, and counts match', () => {
    for (const f of ['no_rate', 'stale', 'locked'] as const) {
      expect(applyIngredientFilter(data.rows, f, '')).toHaveLength(data.counts[f]);
    }
  });

  it('searches the name and the supplier', () => {
    expect(applyIngredientFilter(data.rows, 'all', 'ghee').length).toBeGreaterThan(0);
    expect(applyIngredientFilter(data.rows, 'all', 'aavin').length).toBeGreaterThan(0);
  });
});

describe('type-ahead is duplicate prevention', () => {
  it('surfaces what already exists before a second one is made', () => {
    // Two entries for one ingredient is the failure that quietly makes costing
    // wrong, and the entry row is the only place to catch it (A19).
    const near = nearMatches(data.rows, 'oni');
    expect(near.map((r) => r.name)).toContain('Onion, big');
  });

  it('says nothing until there is enough to go on', () => {
    expect(nearMatches(data.rows, 'o')).toHaveLength(0);
  });
});

describe('the rate a pack implies', () => {
  it('works the example out before the keystroke, not after it', () => {
    // 250 g for 340.00 is 1,360.00 a kilo, and 100 g of it costs 136.00.
    const derived = deriveRate(0.25, 'kg', 340);
    expect(derived.perUnit).toBeCloseTo(1360, 8);
    expect(derived.sampleQty).toBe(100);
    expect(derived.sampleCost).toBeCloseTo(136, 8);
    expect(sampleUnit('kg')).toBe('g');
  });

  it('says nothing rather than guessing when a figure is missing', () => {
    expect(deriveRate(1, 'kg', null).perUnit).toBeNull();
    expect(deriveRate(0, 'kg', 100).perUnit).toBeNull();
  });

  it('writes the example in the unit a recipe would use', () => {
    expect(sampleUnit('l')).toBe('ml');
    expect(sampleUnit('pc')).toBe('pc');
    expect(deriveRate(1, 'pc', 2.5).sampleCost).toBeCloseTo(2.5, 10);
  });
});

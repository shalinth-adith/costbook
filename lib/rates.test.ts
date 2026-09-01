/**
 * Rate history, and the distinction the kitchen screen ranks on.
 *
 * A confirmation is real work and belongs in the history — "days since anyone
 * confirmed it" is A39's tie-breaker — and it is not a movement. An ingredient
 * checked every Monday and unchanged since March has twelve records and no
 * volatility; counting those as moves would put it at the top of a list it has
 * no business being on.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { withRate } from '@/core/ingredient';

import { isMovement, type RateChange } from './org';
import {
  daysSinceConfirmed,
  lastTouched,
  latestRate,
  movementCount,
  movements,
  volatility,
} from './rates';
import { allIngredients, putIngredient, rateHistory, seedForTests } from './store';
import { meta, recipes, shelf } from './data';

const change = (from: number | null, to: number, on: string, source: RateChange['source'] = 'manual'): RateChange =>
  ({ from, to, qty: 1, on, source });

describe('what counts as a movement', () => {
  it('a changed figure does', () => {
    expect(isMovement(change(42, 60, '2026-08-30'))).toBe(true);
  });

  it('a confirmation does not', () => {
    expect(isMovement(change(42, 42, '2026-08-30', 'confirmed'))).toBe(false);
  });

  it('a first rate does', () => {
    expect(isMovement(change(null, 42, '2026-08-01'))).toBe(true);
  });
});

describe('reading a history', () => {
  const log: RateChange[] = [
    change(42, 42, '2026-08-30', 'confirmed'),
    change(38, 42, '2026-08-20'),
    change(38, 38, '2026-08-10', 'confirmed'),
    change(null, 38, '2026-08-01', 'import'),
  ];

  it('counts only the moves', () => {
    expect(movements(log)).toHaveLength(2);
    expect(movementCount(log)).toBe(2);
  });

  it('counts moves within a window', () => {
    expect(movementCount(log, '2026-08-15')).toBe(1);
  });

  it('measures days since anyone looked, not since it moved', () => {
    // Confirmed on the 30th, last MOVED on the 20th.
    expect(daysSinceConfirmed(log, '2026-08-31')).toBe(1);
    expect(lastTouched(log)).toBe('2026-08-30');
  });

  it('has nothing to report for an untouched rate', () => {
    expect(daysSinceConfirmed([], '2026-08-31')).toBeNull();
    expect(lastTouched([])).toBeNull();
    expect(latestRate([])).toBeNull();
  });

  it('measures how far the rate has travelled', () => {
    // 38 to 42 on a base of 38.
    expect(volatility(log)).toBeCloseTo(4 / 38, 6);
  });

  it('gives a steady rate no volatility, however often it is confirmed', () => {
    const steady = [
      change(380, 380, '2026-08-30', 'confirmed'),
      change(380, 380, '2026-08-23', 'confirmed'),
      change(380, 380, '2026-08-16', 'confirmed'),
      change(null, 380, '2026-03-01', 'import'),
    ];
    // Only the first rate is a move, and it has nowhere to have travelled from.
    expect(movementCount(steady)).toBe(1);
    expect(volatility(steady)).toBe(0);
  });

  it('counts a rate that went up and came back as having moved twice', () => {
    const there = [change(60, 40, '2026-08-20'), change(40, 60, '2026-08-10')];
    expect(movementCount(there)).toBe(2);
    expect(volatility(there)).toBeCloseTo(40 / 40, 6);
  });
});

describe('recording, through the store', () => {
  beforeEach(() => {
    seedForTests({ recipes, ingredients: shelf, meta });
  });

  const priced = () => allIngredients().find((i) => i.purchasePrice !== null);

  it('a rate edited three times has three records', () => {
    const it0 = priced();
    if (it0 === undefined) return;
    putIngredient(withRate(it0, 100, undefined, '2026-08-01'));
    putIngredient(withRate(allIngredients().find((x) => x.id === it0.id) ?? it0, 200, undefined, '2026-08-02'));
    putIngredient(withRate(allIngredients().find((x) => x.id === it0.id) ?? it0, 300, undefined, '2026-08-03'));
    expect(rateHistory(it0.id)).toHaveLength(3);
    expect(movementCount(rateHistory(it0.id))).toBe(3);
  });

  it('a confirmation with no change is recorded, and is not a movement', () => {
    const it0 = priced();
    if (it0 === undefined) return;
    putIngredient(withRate(it0, 500, undefined, '2026-08-01'));
    const after = allIngredients().find((x) => x.id === it0.id);
    if (after === undefined) return;

    putIngredient({ ...after, pricedAt: '2026-08-05' }, 'confirmed');

    const log = rateHistory(it0.id);
    expect(log).toHaveLength(2);
    expect(movementCount(log)).toBe(1);
    expect(log[0]?.source).toBe('confirmed');
    expect(daysSinceConfirmed(log, '2026-08-06')).toBe(1);
  });

  it('a save that touches nothing about the rate records nothing', () => {
    const it0 = priced();
    if (it0 === undefined) return;
    putIngredient(withRate(it0, 700, undefined, '2026-08-01'));
    const depth = rateHistory(it0.id).length;
    const after = allIngredients().find((x) => x.id === it0.id);
    if (after === undefined) return;
    // A yield change, not a rate change.
    putIngredient({ ...after, yieldPercent: 80 });
    expect(rateHistory(it0.id)).toHaveLength(depth);
  });

  it('remembers how the rate arrived', () => {
    const it0 = priced();
    if (it0 === undefined) return;
    putIngredient(withRate(it0, 11, undefined, '2026-08-01'), 'import');
    expect(rateHistory(it0.id)[0]?.source).toBe('import');
  });
});

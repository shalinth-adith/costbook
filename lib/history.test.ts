/**
 * Rate history — specified in TRD 5 since the beginning and never recorded
 * until now. A rate change used to overwrite, so "the price has always been
 * that" had only the operator's memory to answer it.
 */
import { describe, expect, it } from 'vitest';

import { withRate } from '@/core/ingredient';

import { allIngredients, putIngredient, rateHistory } from './store';

const target = allIngredients().find((i) => i.purchasePrice !== null);

describe('recording a rate change', () => {
  it('finds a priced ingredient to move', () => {
    expect(target).toBeDefined();
  });

  it('keeps the old rate and the new one, newest first', () => {
    if (target === undefined || target.purchasePrice === null) return;
    const before = target.purchasePrice;

    putIngredient(withRate(target, 500, undefined, '2026-08-30'));
    putIngredient(
      withRate(
        allIngredients().find((i) => i.id === target.id) ?? target,
        900,
        undefined,
        '2026-08-31',
      ),
    );

    const log = rateHistory(target.id);
    expect(log.length).toBeGreaterThanOrEqual(2);
    expect(log[0]?.on).toBe('2026-08-31');
    expect(log[1]?.on).toBe('2026-08-30');
    expect(log[1]?.from).toBeCloseTo(before, 6);
  });

  it('records nothing when the rate does not move', () => {
    const other = allIngredients().find((i) => i.purchasePrice !== null && i.id !== target?.id);
    if (other === undefined || other.purchasePrice === null) return;
    const depth = rateHistory(other.id).length;
    putIngredient(withRate(other, other.purchasePrice, undefined, '2026-09-01'));
    expect(rateHistory(other.id)).toHaveLength(depth);
  });

  it('caps the list when asked, without deleting anything', () => {
    if (target === undefined) return;
    const full = rateHistory(target.id).length;
    expect(rateHistory(target.id, 1)).toHaveLength(Math.min(1, full));
    expect(rateHistory(target.id)).toHaveLength(full);
  });

  it('has nothing to show for an ingredient nobody has repriced', () => {
    expect(rateHistory('never-touched')).toHaveLength(0);
  });
});

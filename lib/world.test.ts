/**
 * Typical starting points: the same for every currency, never a place or a
 * brand, and every figure a field.
 */

import { describe, expect, it } from 'vitest';

import { hintFor, suggestedPlatforms, suggestedTarget } from './world';

describe('hintFor', () => {
  it('says the same thing for every currency, and names no place', () => {
    expect(hintFor('INR')).toEqual(hintFor('AED'));
    expect(hintFor('XYZ')).toEqual(hintFor('USD'));
    expect(hintFor('AED').note).not.toMatch(/UAE|India|Talabat|Swiggy/);
  });
});

describe('suggestedTarget', () => {
  it('starts lower where any order goes through an app', () => {
    const h = hintFor('INR');
    expect(suggestedTarget(h, 'dine_in')).toBe(32);
    expect(suggestedTarget(h, 'delivery')).toBe(28);
    expect(suggestedTarget(h, 'both')).toBe(28);
  });
});

describe('suggestedPlatforms', () => {
  it('offers one delivery-app row the operator bears, with no brand on it', () => {
    const cs = suggestedPlatforms(hintFor('AED'), 3);
    expect(cs).toHaveLength(1);
    expect(cs[0]?.name).toBe('Delivery app commission');
    expect(cs[0]?.borneBy).toBe('operator');
    expect(cs[0]?.channels).toEqual(['delivery']);
    expect(cs[0]?.value).toBe(23);
    expect(cs[0]?.order).toBe(3);
  });
});

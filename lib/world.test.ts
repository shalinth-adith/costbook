/**
 * Typical starting points by currency: suggestions with a field beside each,
 * never rules, and a fallback that is honest about not knowing.
 */

import { describe, expect, it } from 'vitest';

import { hintFor, hintIsSpecific, suggestedPlatforms, suggestedTarget } from './world';

describe('hintFor', () => {
  it('knows the currencies the product sells in first', () => {
    expect(hintFor('INR').region).toBe('India');
    expect(hintFor('aed').region).toBe('the UAE');
    expect(hintFor('USD').pricesIncludeTax).toBe(false);
    expect(hintFor('GBP').pricesIncludeTax).toBe(true);
  });

  it('gives the world’s range for a currency it does not know, and says so', () => {
    const h = hintFor('XYZ');
    expect(h.dineIn).toEqual([28, 35]);
    expect(h.pricesIncludeTax).toBeNull();
    expect(hintIsSpecific('XYZ')).toBe(false);
    expect(hintIsSpecific('INR')).toBe(true);
  });
});

describe('suggestedTarget', () => {
  it('starts lower where any order goes through a platform', () => {
    const h = hintFor('INR');
    expect(suggestedTarget(h, 'dine_in')).toBe(32);
    expect(suggestedTarget(h, 'delivery')).toBe(28);
    expect(suggestedTarget(h, 'both')).toBe(28);
  });
});

describe('suggestedPlatforms', () => {
  it('turns the region’s platforms into operator-borne delivery charges', () => {
    const cs = suggestedPlatforms(hintFor('AED'));
    expect(cs.map((c) => c.name)).toEqual(['Talabat commission', 'Deliveroo commission', 'Noon Food commission']);
    expect(cs.every((c) => c.borneBy === 'operator' && c.channels.length === 1 && c.channels[0] === 'delivery')).toBe(true);
    expect(cs[0]?.value).toBe(23);
  });

  it('numbers them after what is already in the stack', () => {
    expect(suggestedPlatforms(hintFor('USD'), 3).map((c) => c.order)).toEqual([3, 4, 5]);
  });
});

/**
 * How old a rate is, in the words a kitchen uses (A19).
 *
 * The screen showed "2026-08-14" and left the reader to do the arithmetic. The
 * question that column answers is how old the figure is, not what the calendar
 * said when it was typed.
 */
import { describe, expect, it } from 'vitest';

import { ago } from './format';

describe('how long ago', () => {
  it('says never when a rate was never given', () => {
    expect(ago(null)).toBe('never');
  });

  it('reads today and yesterday as words, not as numbers', () => {
    expect(ago(0)).toBe('today');
    expect(ago(1)).toBe('yesterday');
  });

  it('counts days for the first fortnight', () => {
    expect(ago(3)).toBe('3 days ago');
    expect(ago(13)).toBe('13 days ago');
  });

  it('moves to weeks, then months, then years', () => {
    expect(ago(21)).toBe('3 weeks ago');
    expect(ago(90)).toBe('3 months ago');
    expect(ago(365)).toBe('a year ago');
    expect(ago(800)).toBe('2 years ago');
  });

  it('never says "0 days ago"', () => {
    for (let d = 0; d < 1000; d += 1) expect(ago(d)).not.toMatch(/^0 /);
  });
});

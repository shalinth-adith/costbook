/**
 * A flag is a small object with a dish attached (A40).
 *
 * Not messaging, and the tests are here to keep it that way: no thread, no
 * delivery tick that implies something it does not know, and a named person
 * rather than a role.
 */
import { describe, expect, it } from 'vitest';

import { type Flag, deliveryState, forRecipe, markFor, unread, whenSent } from './flags';

const flag = (over: Partial<Flag> = {}): Flag => ({
  id: 'f1',
  recipeId: 'kothu',
  dish: 'Mutton Kothu Parotta',
  from: 'Suresh',
  note: 'Mutton went up again on Tuesday',
  cost: 96.4,
  price: 219,
  foodCost: 44,
  target: 32,
  sentAt: '2026-08-31T08:00:00.000Z',
  openedAt: null,
  seenAt: null,
  ...over,
});

describe('what the owner sees', () => {
  it('counts only what has not been seen', () => {
    expect(unread([flag(), flag({ id: 'f2', seenAt: '2026-08-31' })])).toHaveLength(1);
  });

  it('finds what has been said about one dish', () => {
    expect(forRecipe([flag(), flag({ id: 'f2', recipeId: 'other' })], 'kothu')).toHaveLength(1);
  });
});

describe('the receipt is honest about delivery', () => {
  it('does not claim it was opened', () => {
    expect(deliveryState(flag(), 'Karthik')).toBe("Karthik hasn't opened it yet");
  });

  it('says opened when it was opened, which is not the same as dealt with', () => {
    expect(deliveryState(flag({ openedAt: '2026-08-31' }), 'Karthik')).toBe('Karthik has opened it');
  });

  it('says seen only once someone said so', () => {
    expect(deliveryState(flag({ seenAt: '2026-08-31' }), 'Karthik')).toBe('Karthik has seen it');
  });

  /*
   * The name is not a gender. "He hasn't opened it yet" is the frame's own
   * wording for one named man; the code cannot know that of anybody, so it
   * uses the name and avoids the pronoun entirely.
   */
  it('never guesses a pronoun', () => {
    for (const state of [flag(), flag({ openedAt: 'x' }), flag({ seenAt: 'x' })]) {
      expect(deliveryState(state, 'Priya')).not.toMatch(/\b(he|she|his|her)\b/i);
    }
  });
});

describe('the mark a dish keeps', () => {
  it('names the person it went to', () => {
    expect(markFor([flag()], 'kothu', 'Karthik')).toBe('SENT TO KARTHIK');
  });

  it('is absent when nothing has been said', () => {
    expect(markFor([], 'kothu', 'Karthik')).toBeNull();
  });
});

describe('when it was sent', () => {
  it('reads as a kitchen would say it', () => {
    expect(whenSent('2026-08-31T08:00:00Z', '2026-08-31')).toBe('this morning');
    expect(whenSent('2026-08-30T08:00:00Z', '2026-08-31')).toBe('yesterday');
    expect(whenSent('2026-08-28T08:00:00Z', '2026-08-31')).toBe('3 days ago');
  });

  it('falls back to the date once it is not this week', () => {
    expect(whenSent('2026-08-01T08:00:00Z', '2026-08-31')).toBe('2026-08-01');
  });
});

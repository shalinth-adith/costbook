import { describe, expect, it } from 'vitest';

import {
  type Account,
  type Attempts,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  NO_ATTEMPTS,
  fieldFaults,
  nextAttempts,
  signIn,
  suggestEmail,
} from './auth';

const NOW = Date.UTC(2026, 7, 28, 9, 0, 0);
const DIRECTORY = ['rk@srikrishnacafe.in', 'meena@srikrishnacafe.in'];

const VERIFIED: Account = {
  email: 'rk@srikrishnacafe.in',
  verifiedAt: NOW - 90 * 24 * 60 * 60 * 1000,
  verificationSentAt: NOW - 90 * 24 * 60 * 60 * 1000,
};

function facts(over: Partial<Parameters<typeof signIn>[2]> = {}) {
  return {
    account: VERIFIED,
    passwordMatches: true,
    directory: DIRECTORY,
    attempts: NO_ATTEMPTS,
    now: NOW,
    ...over,
  };
}

describe('the fields — A10 · 01, 02', () => {
  it('names both fields when both are empty', () => {
    const faults = fieldFaults('', '');
    expect(faults.map((f) => f.field)).toEqual(['email', 'password']);
    expect(faults[0]?.message).toBe('We need your email to find your account.');
    expect(faults[1]?.message).toBe('And your password.');
  });

  it('rejects an address with no ending', () => {
    const faults = fieldFaults('rk@srikrishnacafe', 'letmein');
    expect(faults).toHaveLength(1);
    expect(faults[0]?.field).toBe('email');
    expect(faults[0]?.message).toContain('missing its ending');
  });

  it('accepts the addresses real cafés use', () => {
    for (const email of ['rk@srikrishnacafe.in', 'a.b+tag@sub.domain.co.in', "o'neil@cafe.com"]) {
      expect(fieldFaults(email, 'x')).toEqual([]);
    }
  });

  it('checks shape before it looks anything up', () => {
    // An account exists and the password is right; the malformed address still wins.
    const result = signIn('rk@srikrishnacafe', 'correct', facts());
    expect(result.kind).toBe('fields');
  });
});

describe('the near miss — A10 · 05', () => {
  it('offers the address the canvas offers', () => {
    expect(suggestEmail('rk@srikrishnacafe.co.in', DIRECTORY)).toBe('rk@srikrishnacafe.in');
  });

  it('says nothing when the address is simply someone else', () => {
    expect(suggestEmail('owner@anothercafe.com', DIRECTORY)).toBeNull();
  });

  it('never suggests the address that was typed', () => {
    expect(suggestEmail('rk@srikrishnacafe.in', DIRECTORY)).toBeNull();
  });

  it('reports the unknown address alongside the suggestion', () => {
    const result = signIn('rk@srikrishnacafe.co.in', 'anything', facts({ account: null }));
    expect(result).toEqual({
      kind: 'unknown-email',
      typed: 'rk@srikrishnacafe.co.in',
      suggestion: 'rk@srikrishnacafe.in',
    });
  });
});

describe('wrong passwords — A10 · 03, 04', () => {
  it('counts down the tries the message promises', () => {
    const attempts: Attempts = { wrong: 2, lockedUntil: null };
    const result = signIn('rk@srikrishnacafe.in', 'nope', facts({ passwordMatches: false, attempts }));
    expect(result).toEqual({ kind: 'wrong-password', triesLeft: 2 });
  });

  it('locks on the fifth, not the sixth', () => {
    let attempts = NO_ATTEMPTS;
    const guesses: string[] = [];
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      const result = signIn('rk@srikrishnacafe.in', 'nope', facts({ passwordMatches: false, attempts }));
      guesses.push(result.kind);
      attempts = nextAttempts(attempts, result, NOW);
    }
    expect(guesses).toEqual([
      'wrong-password',
      'wrong-password',
      'wrong-password',
      'wrong-password',
      'locked',
    ]);
    expect(attempts.lockedUntil).toBe(NOW + LOCKOUT_MS);
  });

  it('holds the lock against a correct password until it expires', () => {
    const attempts: Attempts = { wrong: MAX_ATTEMPTS, lockedUntil: NOW + 60_000 };
    const held = signIn('rk@srikrishnacafe.in', 'correct', facts({ attempts }));
    expect(held).toEqual({ kind: 'locked', unlocksInMs: 60_000 });

    const later = signIn('rk@srikrishnacafe.in', 'correct', facts({ attempts, now: NOW + 61_000 }));
    expect(later.kind).toBe('ok');
  });

  it('forgives the whole run once the right password arrives', () => {
    const attempts: Attempts = { wrong: 4, lockedUntil: null };
    const result = signIn('rk@srikrishnacafe.in', 'correct', facts({ attempts }));
    expect(result.kind).toBe('ok');
    expect(nextAttempts(attempts, result, NOW)).toEqual(NO_ATTEMPTS);
  });

  it('cannot be locked by someone who cannot spell the address', () => {
    const before: Attempts = { wrong: 3, lockedUntil: null };
    const unknown = signIn('typo@nowhere.com', 'x', facts({ account: null, attempts: before }));
    expect(nextAttempts(before, unknown, NOW)).toEqual(before);

    const empty = signIn('', '', facts({ attempts: before }));
    expect(nextAttempts(before, empty, NOW)).toEqual(before);
  });
});

describe('verification — A10 · 06', () => {
  const UNVERIFIED: Account = {
    email: 'rk@srikrishnacafe.in',
    verifiedAt: null,
    verificationSentAt: NOW - 4 * 24 * 60 * 60 * 1000,
  };

  it('counts the days since we sent the link', () => {
    const result = signIn('rk@srikrishnacafe.in', 'correct', facts({ account: UNVERIFIED }));
    expect(result).toEqual({
      kind: 'unverified',
      email: 'rk@srikrishnacafe.in',
      sentDaysAgo: 4,
    });
  });

  /**
   * The ordering that matters. A wrong password must not learn that the
   * address exists but is unverified — that is two facts handed to a guess.
   */
  it('says nothing about verification to a wrong password', () => {
    const result = signIn(
      'rk@srikrishnacafe.in',
      'nope',
      facts({ account: UNVERIFIED, passwordMatches: false }),
    );
    expect(result.kind).toBe('wrong-password');
  });

  it('clears the attempt count — the password was right', () => {
    const before: Attempts = { wrong: 2, lockedUntil: null };
    const result = signIn('rk@srikrishnacafe.in', 'correct', facts({ account: UNVERIFIED, attempts: before }));
    expect(nextAttempts(before, result, NOW)).toEqual(NO_ATTEMPTS);
  });
});

describe('signing in', () => {
  it('returns the stored address, not the one typed', () => {
    // Case and stray spaces are the operator's, not the account's.
    const result = signIn('  RK@SriKrishnaCafe.in  ', 'correct', facts());
    expect(result).toEqual({ kind: 'ok', email: 'rk@srikrishnacafe.in' });
  });
});

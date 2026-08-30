import { beforeAll, describe, expect, it } from 'vitest';

import { currency } from '@/core/currency';

import { recipes } from './data';
import {
  allRecipes,
  clearBook,
  currencyCode,
  currencyIsSettable,
  putRecipe,
  setCurrency,
  seedForTests,
} from './store';
import { meta as fixtureMeta, recipes as fixtureRecipes, shelf as fixtureShelf } from './data';

/**
 * The currency is chosen once, at the start.
 *
 * Costbook holds one per account and converts nothing (TRD 4), so every figure
 * on a screen is a figure the operator typed. That only stays true if the
 * currency settles the moment anything is priced in it: relabelling an account
 * that already holds rates would leave one currency's figures under another's
 * symbol, which is a worse number than any it was meant to fix.
 */

/*
 * The store starts empty, as a real account does — there is no fixture café in
 * a running Costbook. These tests exercise writes, so they put the fixture book
 * in first, explicitly.
 */
beforeAll(() => {
  seedForTests({ recipes: fixtureRecipes, ingredients: fixtureShelf, meta: fixtureMeta });
});

describe('while nothing is costed', () => {
  it('can be chosen', () => {
    clearBook();
    expect(currencyIsSettable()).toBe(true);

    setCurrency('AED');
    expect(currencyCode()).toBe('AED');
    expect(currency(currencyCode()).name).toBe('UAE dirham');
  });

  it('can be changed again, because nothing depends on it yet', () => {
    clearBook();
    setCurrency('GBP');
    setCurrency('EUR');
    expect(currencyCode()).toBe('EUR');
  });

  it('ignores a currency it does not know rather than storing it', () => {
    clearBook();
    setCurrency('INR');
    setCurrency('XYZ');
    expect(currencyCode()).toBe('INR');
  });
});

describe('once a dish is costed', () => {
  it('settles, and further attempts change nothing', () => {
    clearBook();
    setCurrency('INR');

    // One dish is enough: its rates were typed in the currency then in force.
    const first = recipes[0];
    if (first === undefined) throw new Error('no recipes to seed with');
    putRecipe(first);

    expect(currencyIsSettable()).toBe(false);

    setCurrency('AED');
    expect(currencyCode()).toBe('INR');
  });

  it('becomes settable again only when the account is emptied', () => {
    expect(allRecipes().length).toBeGreaterThan(0);
    clearBook();
    expect(currencyIsSettable()).toBe(true);
  });
});

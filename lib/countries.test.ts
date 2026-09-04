import { describe, expect, it } from 'vitest';

import { COUNTRIES, countriesAreFormattable, countryOf, searchCountries } from './countries';

describe('countries', () => {
  it('offers only a currency the product can format', () => {
    expect(countriesAreFormattable()).toBe(true);
  });
  it('finds a country by name or code, case aside', () => {
    expect(countryOf('ae')?.currency).toBe('AED');
    expect(searchCountries('emir')[0]?.code).toBe('AE');
    expect(searchCountries('IN').some((c) => c.code === 'IN')).toBe(true);
    expect(searchCountries('')).toHaveLength(COUNTRIES.length);
  });
});

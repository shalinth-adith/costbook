import { describe, expect, it } from 'vitest';

import { book, recipes, shelf, usedInCount } from './data';
import { countRows, pickerGroups } from './picker';

const groupsFor = (query = '', excludeRecipeId = 'plate') =>
  pickerGroups({ shelf, recipes, book, excludeRecipeId, usedInCount, query });

const kindOf = (name: string) => {
  for (const g of groupsFor()) {
    if (g.rows.some((r) => r.name === name)) return g.kind;
  }
  return null;
};

describe('the picker groups by what each thing actually is', () => {
  it('puts things you buy under ingredients', () => {
    for (const name of ['Onion, big', 'Coriander leaves', 'Lemon', 'Ghee, Aavin']) {
      expect(kindOf(name)).toBe('ingredient');
    }
  });

  it('puts everything you make under dishes, whether or not it is sold alone', () => {
    // A gravy, a parotta and a kuruma are food. So is the plate they go on.
    for (const name of [
      'Onion Thakkali Gravy',
      'Veechu Parotta',
      'Chicken Kuruma',
      'Mini Idly, steamed',
      'Ghee Podi Idly Fry',
    ]) {
      expect(kindOf(name)).toBe('dish');
    }
  });

  it('never lists a made thing as an ingredient', () => {
    const ingredients = groupsFor().find((g) => g.kind === 'ingredient')?.rows ?? [];
    const madeNames = recipes.map((r) => r.name);

    for (const row of ingredients) {
      expect(madeNames).not.toContain(row.name);
    }
  });

  it('orders ingredients first, dishes second', () => {
    // What you buy before what you make, which is the order a cook thinks in.
    expect(groupsFor().map((g) => g.kind)).toEqual(['ingredient', 'dish']);
  });

  it('drops a group entirely rather than showing it empty', () => {
    const kinds = groupsFor('lemon').map((g) => g.kind);
    expect(kinds).toContain('ingredient');
    expect(kinds).not.toContain('dish');
  });
});

describe('what each row says about itself', () => {
  const rowFor = (name: string) =>
    groupsFor().flatMap((g) => g.rows).find((r) => r.name === name);

  it('says an ingredient is bought in, with its pack', () => {
    expect(rowFor('Onion, big')?.meta).toContain('bought in');
    expect(rowFor('Onion, big')?.meta).toContain('kg pack');
  });

  it('says a dish is made, and what one batch yields', () => {
    expect(rowFor('Veechu Parotta')?.meta).toContain('you make this');
    expect(rowFor('Veechu Parotta')?.meta).toContain('yields 24 pcs');
  });

  it('adds the portion count when the dish plates into portions', () => {
    expect(rowFor('Ghee Podi Idly Fry')?.meta).toContain('4 portions');
    // A gravy is made by the kilo and never plated, so it says only its yield.
    expect(rowFor('Onion Thakkali Gravy')?.meta).not.toContain('portions');
  });

  it('reports a missing rate as absent rather than as free', () => {
    const podi = rowFor('Milagai podi, house');
    expect(podi?.noRate).toBe(true);
    expect(podi?.rateText).toBe('no rate on file');
    expect(podi?.rateText).not.toContain('0.00');
  });

  it('reports a dish whose own rate is missing inside it', () => {
    // Ghee Podi Idly Fry contains the unpriced podi, so it cannot offer a rate.
    const dish = rowFor('Ghee Podi Idly Fry');
    expect(dish?.noRate).toBe(true);
    expect(dish?.rateText).toContain('missing inside it');
  });
});

describe('the list itself', () => {
  it('never offers the dish being edited', () => {
    const names = groupsFor('', 'plate').flatMap((g) => g.rows).map((r) => r.name);
    expect(names).not.toContain('Parotta Kuruma Plate');
  });

  it('searches across all three kinds at once', () => {
    const names = groupsFor('idly').flatMap((g) => g.rows).map((r) => r.name);
    expect(names).toContain('Mini Idly, steamed');
    expect(names).toContain('Ghee Podi Idly Fry');
  });

  it('returns nothing rather than a guess when there is no match', () => {
    expect(countRows(groupsFor('kasoori'))).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL } from './costing';
import { ORG, meta, pantry, recipes } from './data';
import type { LibraryRow } from './library';
import {
  applyLibraryFilter,
  describeMatch,
  groupByCategory,
  library,
  search,
} from './library';

const model = { ...DEFAULT_MODEL, foodCostTarget: ORG.foodCostTarget };
const data = library({ ids: recipes.map((r) => r.id), pantry, meta, model });
const all = [...data.dishes, ...data.batches];
const row = (name: string) => all.find((r) => r.name === name);

describe('the split between dishes and batches', () => {
  it('puts anything that plates into portions under dishes', () => {
    for (const name of ['Ghee Podi Idly Fry', 'Parotta Kuruma Plate', 'Filter Coffee']) {
      expect(row(name)?.kind).toBe('dish');
    }
  });

  it('puts anything made by the kilo or the piece under batches', () => {
    for (const name of ['Chicken Kuruma', 'Veechu Parotta', 'Onion Thakkali Gravy', 'Mini Idly, steamed']) {
      expect(row(name)?.kind).toBe('batch');
    }
  });

  it('gives a batch the figure you compare it by', () => {
    // Cost per unit made, not per portion — it is what you look at when
    // linking one into a dish.
    const parotta = row('Veechu Parotta');
    expect(parotta?.costPerUnit).toBeCloseTo(118.64 / 24, 8);
    expect(parotta?.outputUnit).toBe('pc');
  });

  it('gives a batch no price and no food cost, rather than blanks', () => {
    const kuruma = row('Chicken Kuruma');
    expect(kuruma?.sellingPrice).toBeNull();
    expect(kuruma?.foodCostPercent).toBeNull();
  });

  it('counts how many dishes each batch is used in', () => {
    expect(row('Veechu Parotta')?.usedIn).toBeGreaterThan(0);
    expect(row('Onion Thakkali Gravy')?.usedIn).toBeGreaterThan(0);
  });
});

describe('search reaches into ingredients', () => {
  /**
   * Which dishes use an ingredient is the question an owner asks the hour its
   * rate spikes. A name-only search cannot answer it.
   */
  it('surfaces dishes containing an ingredient, not just matching names', () => {
    const found = search(data.dishes, 'ghee', pantry);
    const names = found.rows.map((r) => r.name);

    expect(names).toContain('Ghee Podi Idly Fry'); // by name
    expect(names).toContain('Parotta Kuruma Plate'); // by an ingredient in it
    expect(found.byIngredient).toBeGreaterThan(0);
  });

  it('names the matched ingredient on the row', () => {
    const found = search(data.dishes, 'cashew', pantry);
    for (const r of found.rows) {
      if (r.matchedOn !== null) expect(r.matchedOn.toLowerCase()).toContain('cashew');
    }
  });

  it('reaches an ingredient nested inside a sub-recipe', () => {
    // The plate holds the kuruma, the kuruma holds the gravy, the gravy holds
    // the tomato. Searching tomato has to find the plate.
    const names = search(data.dishes, 'tomato', pantry).rows.map((r) => r.name);
    expect(names).toContain('Parotta Kuruma Plate');
  });

  it('says how many matched each way', () => {
    const found = search(data.dishes, 'ghee', pantry);
    const sentence = describeMatch(found, 'dish');
    expect(sentence).toContain('by name');
    expect(sentence).toContain('by an ingredient in them');
  });

  it('finds nothing rather than guessing', () => {
    expect(search(data.dishes, 'kasoori methi', pantry).rows).toHaveLength(0);
  });
});

describe('filters', () => {
  it('hides archived rows everywhere except the archived filter', () => {
    const first = data.dishes[0];
    if (first === undefined) throw new Error('no dishes to archive');
    const archived: LibraryRow = { ...first, archived: true, id: 'x', name: 'Old dish' };
    const rows: readonly LibraryRow[] = [...data.dishes, archived];

    expect(applyLibraryFilter(rows, 'all').some((r) => r.archived)).toBe(false);
    expect(applyLibraryFilter(rows, 'archived').every((r) => r.archived)).toBe(true);
  });

  it('narrows to what is priced, what is incomplete, and what is over', () => {
    expect(applyLibraryFilter(data.dishes, 'on_menu').every((r) => r.sellingPrice !== null)).toBe(true);
    expect(applyLibraryFilter(data.dishes, 'incomplete').every((r) => !r.complete)).toBe(true);
    expect(applyLibraryFilter(data.dishes, 'over').every((r) => r.status === 'over')).toBe(true);
  });
});

describe('grouping', () => {
  it('groups by category, sorted for retrieval rather than consequence', () => {
    // The dashboard sorts worst first because it answers what is wrong today.
    // This screen is opened to find one thing, so it groups and sorts by name.
    const groups = groupByCategory(data.dishes);
    expect(groups.length).toBeGreaterThan(1);

    for (const g of groups) {
      const names = g.rows.map((r) => r.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    }
  });

  it('counts only live rows in the tab totals', () => {
    expect(data.dishCount).toBe(data.dishes.filter((r) => !r.archived).length);
    expect(data.batchCount).toBe(data.batches.filter((r) => !r.archived).length);
  });
});

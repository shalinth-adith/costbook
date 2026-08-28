import { describe, expect, it } from 'vitest';

import { DEFAULT_MODEL } from './costing';
import { ORG, dishIds, meta, pantry } from './data';
import { BAR_SCALE, applyFilter, categoriesOf, dashboard } from './dashboard';

const model = { ...DEFAULT_MODEL, foodCostTarget: ORG.foodCostTarget };
const data = dashboard({ ids: dishIds, pantry, meta, model });
const row = (name: string) => data.rows.find((r) => r.name === name);

describe('the sort is the screen argument', () => {
  it('puts the worst food cost first', () => {
    const known = data.rows.filter((r) => r.foodCostPercent !== null);
    for (let i = 1; i < known.length; i += 1) {
      expect(known[i - 1]?.foodCostPercent ?? 0).toBeGreaterThanOrEqual(known[i]?.foodCostPercent ?? 0);
    }
  });

  it('sorts a dish with no food cost to the bottom, not the top', () => {
    // A dish with no cost is unknown, not cheap. Treating a missing figure as
    // zero would fill the top of a worst-first list with the wrong dishes.
    const firstUnknown = data.rows.findIndex((r) => r.foodCostPercent === null);
    if (firstUnknown === -1) return;
    expect(data.rows.slice(firstUnknown).every((r) => r.foodCostPercent === null)).toBe(true);
  });
});

describe('a figure that is not known is not a zero', () => {
  it('leaves the cost empty when a rate is missing', () => {
    const j = row('Jigarthanda');
    expect(j?.gap).toBe('no_rate');
    expect(j?.costPerPortion).toBeNull();
    expect(j?.foodCostPercent).toBeNull();
    expect(j?.delta).toBeNull();
  });

  it('separates three different gaps rather than lumping them together', () => {
    // A cost we cannot compute; a cost that does not apply; and a cost we have
    // with nothing to compare it against. Only the first is a broken recipe.
    expect(row('Jigarthanda')?.gap).toBe('no_rate');
    expect(row('Onion Thakkali Gravy')?.gap).toBe('no_portions');
    expect(row('Parotta Kuruma Plate')?.gap).toBe('none');
  });

  it('gives a dish made by the batch no cost per portion at all', () => {
    // Not zero. It has no portions, so the figure does not exist.
    const gravy = row('Onion Thakkali Gravy');
    expect(gravy?.costPerPortion).toBeNull();
    expect(gravy?.foodCostPercent).toBeNull();
  });

  it('counts each gap separately', () => {
    expect(data.stats.missingRate).toBeGreaterThan(0);
    expect(data.stats.notPlated).toBeGreaterThan(0);
  });

  it('leaves an unknown food cost out of the average', () => {
    const known = data.rows.filter((r) => r.foodCostPercent !== null);
    const mean = known.reduce((s, r) => s + (r.foodCostPercent ?? 0), 0) / known.length;
    expect(data.stats.averageFoodCost).toBeCloseTo(mean, 10);
  });
});

describe('the bar', () => {
  it('stops at the target and draws the rest as overshoot', () => {
    for (const r of data.rows) {
      if (r.foodCostPercent === null) {
        expect(r.barBase).toBe(0);
        expect(r.barOver).toBe(0);
        continue;
      }
      expect(r.barBase).toBeCloseTo(Math.min(r.foodCostPercent, model.foodCostTarget) * BAR_SCALE, 8);
      expect(r.barOver).toBeCloseTo(Math.max(0, r.foodCostPercent - model.foodCostTarget) * BAR_SCALE, 8);
    }
  });

  it('gives an on-target dish no overshoot at all', () => {
    for (const r of data.rows.filter((x) => x.status === 'on')) {
      expect(r.barOver).toBe(0);
    }
  });

  it('puts the target line where the bar would reach it', () => {
    expect(data.targetPx).toBeCloseTo(model.foodCostTarget * BAR_SCALE, 10);
  });
});

describe('status against the target', () => {
  it('agrees with the delta on every row', () => {
    for (const r of data.rows) {
      if (r.delta === null) {
        expect(r.status).toBe('incomplete');
        continue;
      }
      if (r.status === 'over') expect(r.delta).toBeGreaterThan(2);
      if (r.status === 'on') expect(r.delta).toBeLessThan(-2);
      if (r.status === 'near') expect(Math.abs(r.delta)).toBeLessThanOrEqual(2);
    }
  });

  it('counts over-target dishes to match the rows', () => {
    expect(data.stats.over).toBe(data.rows.filter((r) => r.status === 'over').length);
  });
});

describe('filters', () => {
  it('narrows to over-target only', () => {
    const rows = applyFilter(data.rows, 'over', '', 'all');
    expect(rows.length).toBe(data.stats.over);
    expect(rows.every((r) => r.status === 'over')).toBe(true);
  });

  it('narrows to anything not fully costed, whichever gap it has', () => {
    const rows = applyFilter(data.rows, 'incomplete', '', 'all');
    expect(rows.length).toBe(
      data.stats.missingRate + data.stats.notPlated + data.stats.missingPrice,
    );
    expect(rows.every((r) => r.gap !== 'none')).toBe(true);
  });

  it('searches by name and filters by category together', () => {
    const rows = applyFilter(data.rows, 'all', 'biryani', 'all');
    expect(rows.every((r) => r.name.toLowerCase().includes('biryani'))).toBe(true);

    const beverages = applyFilter(data.rows, 'all', '', 'Beverages');
    expect(beverages.every((r) => r.category === 'Beverages')).toBe(true);
    expect(beverages.length).toBeGreaterThan(0);
  });

  it('lists every category present, once each', () => {
    const cats = categoriesOf(data.rows);
    expect(new Set(cats).size).toBe(cats.length);
    expect(cats).toContain('Beverages');
  });
});

describe('nesting is visible from the list', () => {
  it('counts how many component lines are other dishes', () => {
    expect(row('Parotta Kuruma Plate')?.nestedCount).toBe(2);
    expect(row('Mutton Kothu Parotta')?.nestedCount).toBe(1);
    expect(row('Filter Coffee')?.nestedCount).toBe(0);
  });
});

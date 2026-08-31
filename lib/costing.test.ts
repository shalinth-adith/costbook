import { describe, expect, it } from 'vitest';

import { recipeCost } from '@/core/recipe';

import { DEFAULT_MODEL, buildUp, foodCostPercent, statusFor, suggestPrice } from './costing';
import { meta, pantry } from './data';

/** Narrows a plated dish's build-up, which the type keeps nullable. */
function platedBuild(id: string) {
  const b = buildUp(costOf(id));
  if (b.ingredientsPerPortion === null || b.total === null || b.wastage === null || b.packaging === null) {
    throw new Error(`${id} has no portions`);
  }
  return { ...b, ingredientsPerPortion: b.ingredientsPerPortion, total: b.total, wastage: b.wastage, packaging: b.packaging };
}

function costOf(id: string) {
  const recipe = pantry.recipes.get(id);
  if (recipe === undefined) throw new Error(`no recipe ${id}`);
  return recipeCost(recipe, pantry);
}

describe('regression — the printed column must reconcile', () => {
  /**
   * Found on the first render of the cost sheet. The strip printed
   * "132.91 ÷ 6 = 30.69", which is false: 132.91 is the batch pool, and the
   * per-portion lines are not in it. An owner who cannot add up a printed
   * column stops trusting every other figure on the screen (A12).
   */
  it('divides the figure that actually divides', () => {
    const build = platedBuild('plate');

    expect(build.portions).toBe(6);
    expect(build.linesTotal / (build.portions ?? 1)).toBeCloseTo(build.ingredientsPerPortion, 10);
  });

  it('keeps the batch pool and the per-portion pool distinct from the total', () => {
    const build = platedBuild('plate');

    // total = batch + portionAdd x portions. Not the batch pool alone.
    expect(build.linesTotal).toBeCloseTo(
      build.batchPool + build.portionPool * (build.portions ?? 0),
      9,
    );
    expect(build.linesTotal).toBeGreaterThan(build.batchPool);
  });

  it('reaches the total shown at the foot of the rail', () => {
    const build = platedBuild('plate');
    expect(build.ingredientsPerPortion + build.wastage.amount + build.packaging.amount)
      .toBeCloseTo(build.total, 10);
  });
});

describe('what the operator did not enter is marked', () => {
  it('flags wastage and packaging as defaults', () => {
    const build = platedBuild('plate');
    expect(build.wastage.isDefault).toBe(true);
    expect(build.packaging.isDefault).toBe(true);
    expect(build.wastage.label).toContain('2.0%');
  });

  it('takes wastage as a percentage of the ingredient cost', () => {
    const build = platedBuild('plate');
    expect(build.wastage.amount).toBeCloseTo(build.ingredientsPerPortion * 0.02, 10);
  });
});

describe('an incomplete dish', () => {
  it('reports a floor rather than a cost', () => {
    expect(buildUp(costOf('jigarthanda')).complete).toBe(false);
  });

  it('is never given a status that implies its food cost is known', () => {
    expect(statusFor(null, 32)).toBe('incomplete');
  });

  it('has no food cost even when it has a menu price', () => {
    // The stronger version of the rule: the dish is priced, so the arithmetic
    // would succeed — but the numerator is a floor, and a floor over a price
    // is not a food cost. The gap is in the cost, not in the price.
    const dish = meta['jigarthanda'];
    expect(dish?.sellingPrice).not.toBeNull();
    expect(buildUp(costOf('jigarthanda')).complete).toBe(false);

    // And a price that genuinely is absent still yields nothing to report.
    expect(foodCostPercent(16.73, null)).toBeNull();
  });
});

describe('the suggested price shows its working', () => {
  const build = platedBuild('plate');

  it('divides the cost by the target', () => {
    const s = suggestPrice(build.total, DEFAULT_MODEL);
    expect(s.exact).toBeCloseTo(build.total / (DEFAULT_MODEL.foodCostTarget / 100), 10);
  });

  it('always rounds up, never down', () => {
    // Rounding a suggested price down silently erodes the target the operator
    // just set (COSTING_MODELS Axis F).
    for (const rounding of ['charm_99', 'up_to_5', 'nearest_whole', 'none'] as const) {
      const s = suggestPrice(build.total, { ...DEFAULT_MODEL, rounding });
      expect(s.rounded).toBeGreaterThanOrEqual(s.exact - 0.005);
    }
  });

  it('ends a charm price in .99', () => {
    const s = suggestPrice(build.total, { ...DEFAULT_MODEL, rounding: 'charm_99' });
    expect(Number((s.rounded % 1).toFixed(2))).toBeCloseTo(0.99, 6);
  });

  it('offers the alternative with the food cost it produces', () => {
    const s = suggestPrice(build.total, DEFAULT_MODEL);
    expect(s.alternative).not.toBe(s.rounded);
    expect(s.roundedFoodCost).toBeCloseTo((build.total / s.rounded) * 100, 10);
    expect(s.alternativeFoodCost).toBeCloseTo((build.total / s.alternative) * 100, 10);
  });
});

describe('status bands', () => {
  it('reads within two points either side as near', () => {
    expect(statusFor(30.1, 32)).toBe('near');
    expect(statusFor(33.9, 32)).toBe('near');
  });

  it('reads clearly under as on target and clearly over as over', () => {
    expect(statusFor(26.6, 32)).toBe('on');
    expect(statusFor(38.9, 32)).toBe('over');
  });
});

describe('a dish made by the batch and never plated', () => {
  /**
   * Found while building the dashboard: every made-in-house dish showed a cost
   * of 0.35, which was the packaging default added to a null treated as zero.
   * A gravy made by the kilo has no cost per portion because it has no
   * portions, and inventing one is the same failure as treating a missing rate
   * as free — a plausible figure nobody entered.
   */
  it('reports no cost per portion rather than zero', () => {
    const build = buildUp(costOf('gravy'));

    expect(build.portions).toBeNull();
    expect(build.ingredientsPerPortion).toBeNull();
    expect(build.total).toBeNull();
  });

  it('adds no wastage and no packaging to a figure that does not exist', () => {
    const build = buildUp(costOf('gravy'));
    expect(build.wastage).toBeNull();
    expect(build.packaging).toBeNull();
  });

  it('still knows what a batch costs and what one base unit costs', () => {
    const build = buildUp(costOf('gravy'));
    expect(build.linesTotal).toBeCloseTo(114.5607655502, 8);
    expect(build.perBaseUnit).toBeCloseTo(114.5607655502 / 2500, 10);
  });
});

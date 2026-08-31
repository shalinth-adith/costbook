/**
 * The account's target must reach the screen the operator prices on.
 *
 * It did not. The cost sheet composed its model as
 * `{...DEFAULT_MODEL, ...orgModel, foodCostTarget: ORG.foodCostTarget}` — the
 * explicit key beat the spread, so the demo café's 32% overwrote whatever the
 * real account had been set to. A café working at 20% was shown prices a third
 * too low, and told to cut the ones it already charged.
 */

import { describe, expect, it } from 'vitest';
import { type CostingModel, DEFAULT_MODEL, dishModel } from './costing';

/** An account that has been set up, deliberately unlike every default. */
const ORG_MODEL: CostingModel = {
  wastagePercent: 4,
  packagingPerPortion: 0.5,
  foodCostTarget: 20,
  rounding: 'up_to_5',
};

describe('dishModel', () => {
  it('prices at the account’s target, not at Costbook’s', () => {
    expect(dishModel(ORG_MODEL).foodCostTarget).toBe(20);
    expect(DEFAULT_MODEL.foodCostTarget).not.toBe(20); // the bug had something to overwrite
  });

  it('carries every figure the account set', () => {
    expect(dishModel(ORG_MODEL)).toEqual(ORG_MODEL);
  });

  it('lets one dish aim somewhere else', () => {
    expect(dishModel(ORG_MODEL, { foodCostTarget: 28 }).foodCostTarget).toBe(28);
  });

  it('keeps following the account when a dish has no target of its own', () => {
    expect(dishModel(ORG_MODEL, { foodCostTarget: null }).foodCostTarget).toBe(20);
    expect(dishModel(ORG_MODEL, { foodCostTarget: undefined }).foodCostTarget).toBe(20);
  });

  it('does not read a dropped override as a target of zero', () => {
    const m = dishModel(ORG_MODEL, { foodCostTarget: null, packagingPerPortion: null });
    expect(m.foodCostTarget).toBe(20);
    expect(m.packagingPerPortion).toBe(0.5);
  });

  it('overrides one figure without disturbing the rest', () => {
    const m = dishModel(ORG_MODEL, { rounding: 'charm_99' });
    expect(m.rounding).toBe('charm_99');
    expect(m.foodCostTarget).toBe(20);
    expect(m.wastagePercent).toBe(4);
  });

  it('falls back to a default only where the account states nothing', () => {
    const partial = { foodCostTarget: 25 } as unknown as CostingModel;
    const m = dishModel(partial);
    expect(m.foodCostTarget).toBe(25);
    expect(m.rounding).toBe(DEFAULT_MODEL.rounding);
  });
});

import { describe, expect, it } from 'vitest';

import {
  BLANK_ORG,
  TARGET_MAX,
  TARGET_MIN,
  setupComplete,
  stepAnswered,
  targetExample,
  taxLabel,
} from './org';

describe('a fresh org', () => {
  it('has no tax answer, because either default is wrong by a whole tax rate', () => {
    expect(BLANK_ORG.taxTreatment).toBeNull();
  });

  it('is not past setup', () => {
    expect(BLANK_ORG.setupDone).toBe(false);
    expect(setupComplete(BLANK_ORG)).toBe(false);
  });
});

describe('answering a step', () => {
  it('needs a name before step 1 counts', () => {
    expect(stepAnswered(BLANK_ORG, 1)).toBe(false);
    expect(stepAnswered({ ...BLANK_ORG, name: 'Anandha Bhavan' }, 1)).toBe(true);
  });

  it('does not accept whitespace as a name', () => {
    expect(stepAnswered({ ...BLANK_ORG, name: '   ' }, 1)).toBe(false);
  });

  it('needs an explicit tax answer for step 2', () => {
    expect(stepAnswered(BLANK_ORG, 2)).toBe(false);
    expect(stepAnswered({ ...BLANK_ORG, taxTreatment: 'absorbed' }, 2)).toBe(true);
  });

  // "Nothing on top" is the common answer and A22 makes it the primary button,
  // so an empty charge stack is an answer rather than an unfinished step.
  it('counts step 3 as answered with no charges at all', () => {
    expect(BLANK_ORG.charges).toHaveLength(0);
    expect(stepAnswered(BLANK_ORG, 3)).toBe(true);
  });

  it('holds the target inside the slider it is set with', () => {
    expect(stepAnswered({ ...BLANK_ORG, foodCostTarget: TARGET_MIN - 1 }, 4)).toBe(false);
    expect(stepAnswered({ ...BLANK_ORG, foodCostTarget: TARGET_MAX + 1 }, 4)).toBe(false);
    expect(stepAnswered({ ...BLANK_ORG, foodCostTarget: 32 }, 4)).toBe(true);
  });
});

describe('the sentence under the slider', () => {
  // A22: the number is not the point, "a dish costing 12 sells at 40" is.
  it('turns a target into a price', () => {
    const e = targetExample(30, 12);
    expect(e.price).toBeCloseTo(40, 10);
    expect(e.multiple).toBeCloseTo(3.3333, 3);
  });

  it('moves the price as the target moves, holding the cost still', () => {
    const low = targetExample(20, 12);
    const high = targetExample(40, 12);
    expect(low.cost).toBe(high.cost);
    expect(low.price).toBeGreaterThan(high.price);
  });
});

describe('the tax answer read back', () => {
  it('says which way rates are entered, not what the tax is called', () => {
    expect(taxLabel('recoverable')).toContain('without tax');
    expect(taxLabel('absorbed')).toContain('with tax');
    expect(taxLabel(null)).toContain('Not answered');
  });
});

describe('a finished wizard', () => {
  it('is complete once all four are answered', () => {
    const done = {
      ...BLANK_ORG,
      name: 'Anandha Bhavan Café',
      taxTreatment: 'absorbed' as const,
      foodCostTarget: 32,
    };
    expect(setupComplete(done)).toBe(true);
  });
});

/**
 * A line shows the quantity the operator typed, in the unit beside it.
 *
 * Found from a screenshot of a jeera rice that claimed to contain 4000 kg of
 * rice, 1000 kg of green peas and 1000 litres of ghee — in a batch of one
 * plate. The recipe was fine. Every quantity in the system is stored in base
 * units (TRD 3), so 4 kg is held as 4000, and the table printed that raw next
 * to its display unit.
 *
 * The inversion is the same one ratePerUnit documents from the other side: a
 * quantity converts out of base by dividing, a rate by multiplying. Getting it
 * backwards is a thousandfold error that looks like a formatting slip, which is
 * exactly why it survived.
 */
import { describe, expect, it } from 'vitest';

import { ingredientFromPack } from '@/core/ingredient';
import { ingredientComponent, recipeCost, pantryOf } from '@/core/recipe';

import { lineQty, lineRate } from './format';

const peas = ingredientFromPack({
  name: 'Green peas', family: 'mass', packQty: 1, packUnit: 'kg', packPrice: 23,
});
const ghee = ingredientFromPack({
  name: 'Ghee', family: 'volume', packQty: 1, packUnit: 'l', packPrice: 34,
});

describe('the quantity column', () => {
  it('shows 1 kg as 1 kg, not 1000 kg', () => {
    const line = ingredientComponent(peas, 1, 'kg');
    expect(line.qty).toBe(1000);              // stored in base, as it should be
    expect(lineQty(line.qty, line.unit)).toBe('1');  // shown as typed
  });

  it('shows 4 kg of rice as 4', () => {
    const rice = ingredientFromPack({
      name: 'Rice', family: 'mass', packQty: 1, packUnit: 'kg', packPrice: 6,
    });
    const line = ingredientComponent(rice, 4, 'kg');
    expect(lineQty(line.qty, line.unit)).toBe('4');
  });

  it('leaves a line already typed in base units alone', () => {
    const line = ingredientComponent(peas, 250, 'g');
    expect(lineQty(line.qty, line.unit)).toBe('250');
  });

  it('shows 1 litre of ghee as 1, not 1000', () => {
    const line = ingredientComponent(ghee, 1, 'l');
    expect(lineQty(line.qty, line.unit)).toBe('1');
  });

  it('does not invent a conversion for a flat line, which has no unit', () => {
    expect(lineQty(0, '')).toBe('0');
  });
});

/** A rate only exists once a line has been costed, so cost it. */
function costedLine(ing: typeof peas, amount: number, unit: string) {
  const recipe = {
    id: 'r', name: 'T', family: ing.family,
    outputQty: 1000, outputUnit: unit, portions: 1,
    components: [ingredientComponent(ing, amount, unit)],
  };
  return recipeCost(recipe, pantryOf([recipe], [ing])).lines[0];
}

describe('the rate column', () => {
  it('shows a per-kg rate per kg, not per gram', () => {
    const line = costedLine(peas, 1, 'kg');
    expect(line).toBeDefined();
    if (line === undefined) return;
    // Stored per base unit: 23 a kilo is 0.023 a gram.
    expect(line.ratePerBaseUnit).toBeCloseTo(0.023, 6);
    expect(lineRate(line.ratePerBaseUnit, line.unit)).toBeCloseTo(23, 6);
  });

  it('multiplies where the quantity divides', () => {
    const line = costedLine(ghee, 1, 'l');
    expect(line).toBeDefined();
    if (line === undefined) return;
    expect(lineRate(line.ratePerBaseUnit, 'l')).toBeCloseTo(34, 6);
    expect(lineRate(line.ratePerBaseUnit, 'ml')).toBeCloseTo(0.034, 6);
  });

  it('has nothing to show when there is no rate', () => {
    expect(lineRate(null, 'kg')).toBeNull();
  });
});

describe('quantity times rate still reconciles with the line cost', () => {
  // The display must agree with the arithmetic, or an owner who checks the
  // column by hand stops trusting every other figure on the screen.
  it('1 kg of peas at 23 a kilo costs 23', () => {
    const recipe = {
      id: 'r', name: 'Test', family: 'mass' as const,
      outputQty: 1000, outputUnit: 'kg', portions: 1,
      components: [ingredientComponent(peas, 1, 'kg')],
    };
    const cost = recipeCost(recipe, pantryOf([recipe], [peas]));
    const line = cost.lines[0];
    expect(line).toBeDefined();
    if (line === undefined) return;

    const shownQty = Number(lineQty(line.qty, line.unit));
    const shownRate = lineRate(line.ratePerBaseUnit, line.unit) ?? 0;
    expect(shownQty * shownRate).toBeCloseTo(line.cost ?? 0, 6);
    expect(line.cost).toBeCloseTo(23, 6);
  });
});

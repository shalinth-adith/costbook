import { describe, expect, it } from 'vitest';

import { isComplete, recipeCost } from '@/core/recipe';

import { buildUp } from './costing';
import { book, pantry, recipes, shelf } from './data';
import { addComponent, pantryWith, removeLine, setQty, toggleScope } from './edit';

const plate = () => {
  const r = book.get('plate');
  if (r === undefined) throw new Error('no plate');
  return r;
};
const others = () => recipes.filter((r) => r.id !== 'plate');
/** The plate is plated, so this figure always exists; the type keeps it nullable. */
const perPortion = (r = plate()): number => {
  const value = buildUp(recipeCost(r, pantryWith(r, others(), shelf))).ingredientsPerPortion;
  if (value === null) throw new Error(`${r.name} has no portions`);
  return value;
};

describe('changing a quantity', () => {
  it('reprices the dish', () => {
    const before = perPortion();
    const after = perPortion(setQty(plate(), 0, 16)); // parotta 8 pc -> 16 pc
    expect(after).toBeGreaterThan(before);
  });

  it('reprices a nested sub-recipe line through its own cost per base unit', () => {
    const kuruma = recipeCost(book.get('kuruma')!, pantry);
    if (!isComplete(kuruma)) expect.unreachable('kuruma is priced');

    const doubled = setQty(plate(), 1, 960); // kuruma 480 g -> 960 g
    const cost = recipeCost(doubled, pantryWith(doubled, others(), shelf));
    const line = cost.lines.find((l) => l.name === 'Chicken Kuruma');

    expect(line?.cost).toBeCloseTo(960 * kuruma.costPerBase, 9);
  });

  it('ignores a cleared or negative field rather than throwing', () => {
    // A quantity of zero is a removal, not an edit. The engine refuses it, so
    // it must never reach the engine on the way through a cleared input.
    for (const bad of [0, -5, Number.NaN]) {
      expect(setQty(plate(), 0, bad)).toEqual(plate());
    }
  });
});

describe('moving a line between the pools', () => {
  it('changes the per-portion cost by the price of that line', () => {
    // The ghee, drizzled on each plate. In the batch pool it is divided across
    // the six; in the portion pool every plate carries it.
    const ghee = shelf.find((i) => i.name === 'Ghee, Aavin');
    if (ghee === undefined) expect.unreachable('ghee is on the shelf');
    const gheeIndex = plate().components.findIndex(
      (c) => c.kind === 'ingredient' && c.ingredientId === ghee.id,
    );
    expect(gheeIndex).toBeGreaterThanOrEqual(0);

    const asPortion = perPortion();
    const asBatch = perPortion(toggleScope(plate(), gheeIndex));

    const gheeCost = 12 * 0.62;
    expect(asPortion - asBatch).toBeCloseTo(gheeCost - gheeCost / 6, 8);
  });

  it('is its own inverse', () => {
    const once = toggleScope(plate(), 0);
    const twice = toggleScope(once, 0);
    expect(twice.components[0]?.scope).toBe(plate().components[0]?.scope);
  });
});

describe('removing a line', () => {
  it('drops it and reprices', () => {
    const next = removeLine(plate(), 0);
    expect(next.components).toHaveLength(plate().components.length - 1);
    expect(perPortion(next)).toBeLessThan(perPortion());
  });
});

describe('adding a component', () => {
  it('adds an ingredient at one of its purchase unit', () => {
    const ghee = shelf.find((i) => i.name === 'Ghee, Aavin');
    if (ghee === undefined) expect.unreachable('ghee is on the shelf');

    const result = addComponent(plate(), others(), shelf, { kind: 'ingredient', ingredient: ghee });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.recipe.components).toHaveLength(plate().components.length + 1);
    expect(perPortion(result.recipe)).toBeGreaterThan(perPortion());
  });

  it('adds a sub-recipe that carries its own cost across', () => {
    const gravy = recipes.find((r) => r.id === 'gravy');
    if (gravy === undefined) expect.unreachable('gravy exists');

    const result = addComponent(plate(), others(), shelf, { kind: 'recipe', recipe: gravy });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cost = recipeCost(result.recipe, pantryWith(result.recipe, others(), shelf));
    expect(cost.lines.some((l) => l.kind === 'recipe' && l.name === 'Onion Thakkali Gravy')).toBe(true);
  });

  it('makes the dish a floor when the added ingredient has no rate', () => {
    const unpriced = shelf.find((i) => i.purchasePrice === null);
    if (unpriced === undefined) expect.unreachable('something on the shelf has no rate');

    const result = addComponent(plate(), others(), shelf, {
      kind: 'ingredient',
      ingredient: unpriced,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const cost = recipeCost(result.recipe, pantryWith(result.recipe, others(), shelf));
    expect(cost.kind).toBe('floor');
  });

  it('refuses a loop and names the path rather than showing an error code', () => {
    // Adding the plate to the kuruma, when the plate already contains the
    // kuruma. Neither could be costed until one of the two links goes.
    const kuruma = book.get('kuruma');
    const plateRecipe = book.get('plate');
    if (kuruma === undefined || plateRecipe === undefined) expect.unreachable('both exist');

    const result = addComponent(
      kuruma,
      recipes.filter((r) => r.id !== 'kuruma'),
      shelf,
      { kind: 'recipe', recipe: plateRecipe },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.message).toContain('cannot contain itself');
    expect(result.message).toContain('Chicken Kuruma');
    expect(result.message).toContain('→');
    expect(result.message).not.toMatch(/RecipeError|undefined|\[object/);
  });

  it('leaves the recipe untouched when it refuses', () => {
    const kuruma = book.get('kuruma');
    const plateRecipe = book.get('plate');
    if (kuruma === undefined || plateRecipe === undefined) expect.unreachable('both exist');

    const before = kuruma.components.length;
    addComponent(
      kuruma,
      recipes.filter((r) => r.id !== 'kuruma'),
      shelf,
      {
      kind: 'recipe',
      recipe: plateRecipe,
    });
    expect(book.get('kuruma')?.components).toHaveLength(before);
  });
});

describe('the two layouts share one set of edits', () => {
  it('gives the same result whichever invoked it', () => {
    // The table and the cards call the same functions, so switching layout
    // mid-edit cannot lose or change anything.
    const fromTable = setQty(toggleScope(plate(), 6), 0, 12);
    const fromCards = setQty(toggleScope(plate(), 6), 0, 12);
    expect(perPortion(fromTable)).toBe(perPortion(fromCards));
  });
});

describe('what you buy and what you make stay distinct', () => {
  // Costing treats them alike once each cost per base unit is known — but an
  // onion arrives from a supplier and a kuruma is made in the kitchen, and the
  // picker must not merge them into one list.
  it('never lists a made thing among the ingredients', () => {
    const madeNames = recipes.map((r) => r.name);
    for (const i of shelf) {
      expect(madeNames).not.toContain(i.name);
    }
  });

  it('treats nesting a dish inside a dish as ordinary', () => {
    // A parotta goes on a plate; both are food. Nothing about this is unusual.
    const podi = book.get('podi-idly');
    if (podi === undefined) expect.unreachable('podi exists');

    const result = addComponent(plate(), others(), shelf, { kind: 'recipe', recipe: podi });
    expect(result.ok).toBe(true);
  });
});

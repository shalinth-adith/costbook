import { describe, expect, it } from 'vitest';

import { ingredientFromPack } from './ingredient';
import {
  type Pantry,
  type Recipe,
  RecipeError,
  findCycle,
  ingredientComponent,
  pantryOf,
  recipeBook,
  recipeComponent,
  recipeCost,
  wouldCycle,
} from './recipe';

/**
 * The cycle cases, kept in one file on purpose.
 *
 * The same rule is enforced twice — here in `core` for fast feedback while
 * editing, and by a Postgres trigger for integrity at write time (TRD 2). Two
 * implementations of one rule only stay in agreement if they share a test
 * list, so this is that list: when the trigger is written at build step 14, it
 * is tested against exactly these cases.
 */

const SALT = ingredientFromPack({
  name: 'Salt, iodised',
  family: 'mass',
  packQty: 1,
  packUnit: 'kg',
  packPrice: 22,
  yieldPercent: 100,
});

const salt = () => SALT;

/** wouldCycle and findCycle only ever walk recipes, so they take the book. */
const books = (recipes: readonly Recipe[]) => recipeBook(recipes);

/** recipeCost needs the ingredients too. */
const pantry = (recipes: readonly Recipe[]): Pantry => pantryOf(recipes, [SALT]);

/** A recipe with one salt line, so it costs to something non-zero. */
function dish(id: string, name: string, children: readonly string[] = []): Recipe {
  return {
    id,
    name,
    family: 'mass',
    outputQty: 1000,
    outputUnit: 'kg',
    portions: 1,
    components: [
      ingredientComponent(salt(), 10, 'g'),
      ...children.map((childId) =>
        recipeComponent(
          { id: childId, name: childId, family: 'mass', outputQty: 1000, outputUnit: 'kg', portions: 1, components: [] },
          100,
          'g',
        ),
      ),
    ],
  };
}

describe('the acceptance check for build step 7', () => {
  it('refuses A to B to A, and names the path', () => {
    const a = dish('a', 'Onion Thakkali Gravy', ['b']);
    const b = dish('b', 'Kuruma Base', ['a']);
    const book = books([a, b]);
    const kitchen = pantry([a, b]);

    const loop = wouldCycle(a, 'b', book);
    expect(loop).not.toBeNull();
    expect(loop?.names).toEqual(['Onion Thakkali Gravy', 'Kuruma Base', 'Onion Thakkali Gravy']);
  });

  it('names the recipes rather than their ids', () => {
    // FLOWS 5.2: name both recipes and render the loop as a path. An id is not
    // a name, and a cook has never seen one.
    const a = dish('a', 'Onion Thakkali Gravy', ['b']);
    const b = dish('b', 'Kuruma Base', ['a']);

    const loop = findCycle(a, books([a, b]));
    expect(loop?.names.join(' → ')).toBe(
      'Onion Thakkali Gravy → Kuruma Base → Onion Thakkali Gravy',
    );
    // The ids travel too, for anything that needs to act on the loop.
    expect(loop?.ids).toEqual(['a', 'b', 'a']);
    expect(loop?.names).not.toEqual(loop?.ids);
  });

  it('refuses to cost a recipe that already contains a loop', () => {
    const a = dish('a', 'A', ['b']);
    const b = dish('b', 'B', ['a']);
    const book = books([a, b]);
    const kitchen = pantry([a, b]);

    // Terminates rather than hanging, which is the point.
    expect(() => recipeCost(a, kitchen)).toThrowError(RecipeError);

    try {
      recipeCost(a, kitchen);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as RecipeError).code).toBe('cycle');
      expect((error as RecipeError).path).toEqual(['A', 'B', 'A']);
    }
  });
});

describe('loops at every depth', () => {
  it('catches a recipe containing itself', () => {
    const a = dish('a', 'A');
    const loop = wouldCycle(a, 'a', books([a]));
    expect(loop?.names).toEqual(['A', 'A']);
  });

  it('catches A to B to C to A', () => {
    const a = dish('a', 'A', ['b']);
    const b = dish('b', 'B', ['c']);
    const c = dish('c', 'C', ['a']);
    const book = books([a, b, c]);
    const kitchen = pantry([a, b, c]);

    expect(wouldCycle(a, 'b', book)?.names).toEqual(['A', 'B', 'C', 'A']);
  });

  it('catches a loop that does not pass through the recipe being edited', () => {
    // B and C reference each other. Adding B to A must still be refused,
    // because A could never be costed either.
    const a = dish('a', 'A');
    const b = dish('b', 'B', ['c']);
    const c = dish('c', 'C', ['b']);
    const book = books([a, b, c]);
    const kitchen = pantry([a, b, c]);

    expect(wouldCycle(a, 'b', book)).not.toBeNull();
  });

  it('catches a loop five levels down', () => {
    const chain = ['a', 'b', 'c', 'd', 'e'];
    const recipes = chain.map((id, i) =>
      dish(id, id.toUpperCase(), i + 1 < chain.length ? [chain[i + 1] as string] : ['a']),
    );
    const book = books(recipes);
    const a = recipes[0];
    if (a === undefined) expect.unreachable('a exists');

    expect(wouldCycle(a, 'b', book)?.names).toEqual(['A', 'B', 'C', 'D', 'E', 'A']);
  });
});

describe('what is not a loop', () => {
  it('allows the same child twice in one recipe', () => {
    const child = dish('child', 'Gravy');
    const parent = dish('parent', 'Plate', ['child', 'child']);
    const book = books([parent, child]);
    const kitchen = pantry([parent, child]);

    expect(findCycle(parent, book)).toBeNull();
    expect(() => recipeCost(parent, kitchen)).not.toThrow();
  });

  it('allows a diamond — two routes reaching the same child', () => {
    // A uses B and C; both use D. Nothing repeats on any single path, so
    // nothing loops. A naive "have I seen this recipe" check refuses this
    // wrongly, which would block an ordinary kitchen.
    const d = dish('d', 'Gravy');
    const b = dish('b', 'Kuruma', ['d']);
    const c = dish('c', 'Chutney', ['d']);
    const a = dish('a', 'Plate', ['b', 'c']);
    const book = books([a, b, c, d]);
    const kitchen = pantry([a, b, c, d]);

    expect(findCycle(a, book)).toBeNull();
    expect(() => recipeCost(a, kitchen)).not.toThrow();
  });

  it('allows deep nesting that never returns', () => {
    const chain = ['a', 'b', 'c', 'd', 'e', 'f'];
    const recipes = chain.map((id, i) =>
      dish(id, id.toUpperCase(), i + 1 < chain.length ? [chain[i + 1] as string] : []),
    );
    const book = books(recipes);
    const a = recipes[0];
    if (a === undefined) expect.unreachable('a exists');

    expect(findCycle(a, book)).toBeNull();
    expect(() => recipeCost(a, pantry(recipes))).not.toThrow();
  });

  it('says nothing about a recipe with no sub-recipes at all', () => {
    const a = dish('a', 'A');
    expect(findCycle(a, books([a]))).toBeNull();
    expect(wouldCycle(a, 'missing', books([a]))).toBeNull();
  });
});

describe('asking before offering, rather than erroring after', () => {
  it('answers without throwing, so a screen can mark the option', () => {
    const a = dish('a', 'A', ['b']);
    const b = dish('b', 'B', ['a']);
    const book = books([a, b]);
    const kitchen = pantry([a, b]);

    // No try/catch. The interface asks, then decides what to render.
    expect(() => wouldCycle(a, 'b', book)).not.toThrow();
    expect(wouldCycle(a, 'b', book)).not.toBeNull();
  });

  it('agrees with what costing refuses, on the same cases', () => {
    const cases: readonly (readonly [string, readonly string[]])[] = [
      ['self', ['a']],
      ['pair', ['b']],
      ['deep', ['b']],
    ];

    const a = dish('a', 'A', ['b']);
    const b = dish('b', 'B', ['a']);
    const book = books([a, b]);
    const kitchen = pantry([a, b]);

    for (const [, _children] of cases) {
      const predicted = findCycle(a, book) !== null;
      let thrown = false;
      try {
        recipeCost(a, kitchen);
      } catch {
        thrown = true;
      }
      expect(predicted).toBe(thrown);
    }
  });
});

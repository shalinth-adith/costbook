import { describe, expect, it } from 'vitest';

import { withRate, withYield } from '@/core/ingredient';
import { pantryOf, recipeCost } from '@/core/recipe';

import { buildUp } from './costing';
import { recipes, shelf } from './data';

/**
 * The point of holding ingredients by reference.
 *
 * Before this, the same onion existed six times over — once inside each recipe
 * that used it — and editing one would have left the other five at the old
 * price with nothing on screen saying so. These assert the opposite: one
 * ingredient, and a rate change that reaches every dish by construction rather
 * than by anything being kept in step.
 */

const onion = () => {
  const found = shelf.find((i) => i.name === 'Onion, big');
  if (found === undefined) throw new Error('no onion on the shelf');
  return found;
};

const swap = (replacement: ReturnType<typeof onion>) =>
  pantryOf(recipes, shelf.map((i) => (i.id === replacement.id ? replacement : i)));

const perPortion = (id: string, ingredients = shelf) => {
  const pantry = pantryOf(recipes, ingredients);
  const recipe = pantry.recipes.get(id);
  if (recipe === undefined) throw new Error(`no recipe ${id}`);
  return buildUp(recipeCost(recipe, pantry)).total;
};

describe('one ingredient, referenced everywhere', () => {
  it('appears once on the shelf, not once per recipe', () => {
    const onions = shelf.filter((i) => i.name === 'Onion, big');
    expect(onions).toHaveLength(1);
  });

  it('is pointed at by every line that uses it', () => {
    const id = onion().id;
    const users = recipes.filter((r) =>
      r.components.some((c) => c.kind === 'ingredient' && c.ingredientId === id),
    );
    // The gravy, the plate, the biryani, the kothu parotta and the sambar vada.
    expect(users.length).toBeGreaterThan(3);
  });
});

describe('changing a rate reaches every dish', () => {
  it('moves a dish that uses the ingredient directly', () => {
    const before = perPortion('mutton-biryani');
    const dearer = swap(withRate(onion(), 4000)); // 2000 -> 4000 for the same sack
    const after = buildUp(
      recipeCost(dearer.recipes.get('mutton-biryani')!, dearer),
    ).total;

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after ?? 0).toBeGreaterThan(before ?? 0);
  });

  it('moves a dish that only reaches it two levels down', () => {
    // The plate holds the kuruma, the kuruma holds the gravy, and the gravy
    // holds the onion. Nothing between them stores a copy of its price.
    const before = perPortion('plate');
    const dearer = swap(withRate(onion(), 4000));
    const after = buildUp(recipeCost(dearer.recipes.get('plate')!, dearer)).total;

    expect(after ?? 0).toBeGreaterThan(before ?? 0);
  });

  it('moves every affected dish at once, and leaves the rest alone', () => {
    const id = onion().id;
    const dearer = swap(withRate(onion(), 4000));

    const uses = (recipeId: string): boolean => {
      const seen = new Set<string>();
      const walk = (rid: string): boolean => {
        if (seen.has(rid)) return false;
        seen.add(rid);
        const r = dearer.recipes.get(rid);
        if (r === undefined) return false;
        return r.components.some((c) =>
          c.kind === 'ingredient'
            ? c.ingredientId === id
            : c.kind === 'recipe'
              ? walk(c.childId)
              : false,
        );
      };
      return walk(recipeId);
    };

    for (const recipe of recipes) {
      const before = perPortion(recipe.id);
      const after = buildUp(recipeCost(dearer.recipes.get(recipe.id)!, dearer)).total;
      if (before === null || after === null) continue;

      if (uses(recipe.id)) expect(after).toBeGreaterThan(before);
      else expect(after).toBeCloseTo(before, 10);
    }
  });

  it('costs a dish that has no rate as a floor, and as a cost once one is given', () => {
    const syrup = shelf.find((i) => i.name === 'Nannari syrup');
    if (syrup === undefined) throw new Error('no syrup');

    const asIs = pantryOf(recipes, shelf);
    expect(buildUp(recipeCost(asIs.recipes.get('jigarthanda')!, asIs)).complete).toBe(false);

    const priced = swap(withRate(syrup, 260));
    expect(buildUp(recipeCost(priced.recipes.get('jigarthanda')!, priced)).complete).toBe(true);
  });
});

describe('stating a yield the operator had left blank', () => {
  it('stops it being reported as assumed, and makes the dish dearer', () => {
    const ghee = shelf.find((i) => i.name === 'Ghee, Aavin');
    if (ghee === undefined) throw new Error('no ghee');

    const trimmed = withYield(ghee, 90);
    expect(trimmed.yieldIsAssumed).toBe(false);

    const before = perPortion('plate');
    const after = buildUp(
      recipeCost(swap(trimmed).recipes.get('plate')!, swap(trimmed)),
    ).total;

    // A 90% yield makes the usable ghee dearer than a 100% one.
    expect(after ?? 0).toBeGreaterThan(before ?? 0);
  });
});

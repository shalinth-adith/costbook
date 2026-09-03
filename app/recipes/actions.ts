'use server';

import { revalidatePath } from 'next/cache';

import { book, getMeta, getRecipe, saveIngredient, saveMeta, saveRecipe } from '@/lib/book';
import { roomForRecipe } from '@/lib/guard';
import { toBase, unitFamily } from '@/core/units';
import type { RecipeComponent } from '@/core/recipe';
import { draftFrom } from '@/lib/draft';

export interface Ack {
  readonly message: string;
  readonly undoable: boolean;
}

function refresh(): void {
  revalidatePath('/recipes');
  revalidatePath('/dashboard');
}

/**
 * Duplicate a recipe.
 *
 * A first-class action rather than a convenience: a kitchen with six biryanis
 * builds five of them by duplicating the first (A16).
 *
 * The copy keeps the components and loses the price. It is a different dish
 * until someone says otherwise, and inheriting a menu price would be Costbook
 * deciding what to charge for something nobody has costed yet.
 */
export async function duplicateRecipe(id: string): Promise<Ack> {
  const recipe = (await getRecipe(id));
  const dish = (await getMeta(id));
  if (recipe === undefined || dish === undefined) {
    return { message: 'That recipe is no longer here.', undoable: false };
  }

  // A copy is a recipe. Gating `createDish` alone would leave the limit one
  // button away from meaningless — a kitchen with six biryanis builds five of
  // them through this path, which is the whole reason it exists (A16).
  const room = await roomForRecipe();
  if (!room.ok) return { message: room.message, undoable: false };

  const copyId = `${id}-copy-${Date.now().toString(36)}`;
  const name = `${recipe.name} (copy)`;

  await saveRecipe({ ...recipe, id: copyId, name }, undefined);
  await saveMeta(copyId, dish);
  // putMeta only patches what exists, so seed the copy's own entry first.
  await saveMeta(copyId, {
    ...dish,
    onMenu: false,
    sellingPrice: null,
    updatedAt: new Date().toISOString().slice(0, 10),
  });
  refresh();

  return {
    message: `${name} created, with the same components and no price of its own.`,
    undoable: false,
  };
}

/**
 * Archive, and restore.
 *
 * Per row and reversible. Checkboxes down the leading edge invite bulk delete,
 * which is a support problem in a product that sets prices (A16) — so there is
 * no bulk selection and nothing here removes a recipe.
 */
export async function archiveRecipe(id: string, archived: boolean): Promise<Ack> {
  const dish = (await getMeta(id));
  if (dish === undefined) return { message: 'That recipe is no longer here.', undoable: false };

  await saveMeta(id, archived ? { archived: true, onMenu: false } : { archived: false });
  refresh();

  return {
    message: archived
      ? 'Archived. It is off the menu and out of the list, and still linkable as a sub-recipe.'
      : 'Restored. It is back in the list, and still off the menu until you price it.',
    undoable: true,
  };
}

/**
 * Create a dish from the library.
 *
 * It opens empty, with a dash where the cost will be and the arithmetic named
 * but unfilled. Portions is asked now because it is the divisor under every
 * figure that follows (A16).
 */
export async function createDish(input: {
  name: string;
  category: string;
  portions: number;
}): Promise<Ack & { readonly id: string | null }> {
  const name = input.name.trim();
  if (name === '') return { message: 'A dish needs a name.', undoable: false, id: null };

  // Server-side, because a cap the browser enforces is not a cap (FLOWS 9).
  const room = await roomForRecipe();
  if (!room.ok) return { message: room.message, undoable: false, id: null };

  const id = `dish-${Date.now().toString(36)}`;

  await saveRecipe({
    id,
    name,
    family: 'count',
    outputQty: input.portions,
    outputUnit: 'pc',
    portions: input.portions,
    components: [],
  }, undefined);
  await saveMeta(id, {
    category: input.category,
    station: null,
    portionSize: null,
    sellingPrice: null,
    note: 'Nothing on the plate yet.',
    onMenu: false,
    updatedAt: new Date().toISOString().slice(0, 10),
  });
  refresh();

  return { message: `${name} created. Add what goes on it.`, undoable: false, id };
}

/**
 * Create a dish from a pasted recipe, in one go.
 *
 * The old flow asked for a name and a portion count in a modal, created an
 * empty dish, and left the operator on a blank cost sheet to add lines one at
 * a time through a picker. That is the shape of entry every costing product
 * loses its users to — operators report ten hours a week on it and quit before
 * the payoff. The fastest entry any of them offer is a box you paste a recipe
 * into, because the chef already wrote it down somewhere.
 *
 * Anything the paste named that is not on the shelf is created here, with no
 * rate. That is deliberate and it is not a gap: a rate nobody has entered is
 * `null`, the dish reports a floor rather than a cost, and every screen says
 * so. Inventing a rate to make the dish look costed is the one thing this
 * product must never do.
 */
export async function createDishFromPaste(input: {
  readonly name: string;
  readonly category: string;
  readonly portions: number;
  readonly text: string;
  /** How to prepare it, as typed. Prints on the prep card; costs nothing. */
  readonly method: string;
}): Promise<Ack & { readonly id: string | null }> {
  const name = input.name.trim();
  if (name === '') return { message: 'A dish needs a name.', undoable: false, id: null };

  const room = await roomForRecipe();
  if (!room.ok) return { message: room.message, undoable: false, id: null };

  const b = await book();
  const id = `dish-${Date.now().toString(36)}`;

  const drafted = draftFrom({
    text: input.text,
    shelf: b.ingredients,
    recipes: b.recipes,
    excludeRecipeId: id,
  });

  const components: RecipeComponent[] = [];
  let created = 0;

  for (const row of drafted.lines) {
    // A line with no quantity cannot become a component — the engine refuses
    // a quantity of zero, and inventing one would be inventing a cost. It is
    // dropped here and named back to the operator by the screen.
    if (row.line.qty === null) continue;
    const unit = row.line.unit ?? 'g';

    if (row.match.kind === 'recipe') {
      components.push({
        kind: 'recipe',
        scope: 'batch',
        childId: row.match.recipe.id,
        qty: toBase(row.line.qty, unit),
        unit,
        entry: { mode: 'ingredient_rate' },
      });
      continue;
    }

    let ingredientId: string;
    if (row.match.kind === 'ingredient') {
      ingredientId = row.match.ingredient.id;
    } else {
      // New, and priced at nothing until somebody says otherwise.
      ingredientId = `ing-${Date.now().toString(36)}-${String(created)}`;
      const family = unitFamily(unit) ?? 'mass';
      await saveIngredient({
        id: ingredientId,
        name: row.line.name,
        family,
        purchaseQty: 1,
        purchasePrice: null,
        purchaseUnit: unit,
        yieldPercent: 100,
        yieldIsAssumed: true,
      });
      created += 1;
    }

    components.push({
      kind: 'ingredient',
      scope: 'batch',
      ingredientId,
      qty: toBase(row.line.qty, unit),
      unit,
      entry: { mode: 'ingredient_rate' },
    });
  }

  await saveRecipe(
    {
      id,
      name,
      family: 'count',
      outputQty: input.portions,
      outputUnit: 'pc',
      portions: input.portions,
      components,
    },
    undefined,
  );
  await saveMeta(id, {
    category: input.category,
    station: null,
    portionSize: null,
    sellingPrice: null,
    note: '',
    method: input.method.trim() === '' ? null : input.method,
    onMenu: false,
    updatedAt: new Date().toISOString().slice(0, 10),
  });
  refresh();

  const dropped = drafted.lines.length - components.length;
  const parts = [`${name} created with ${String(components.length)} lines`];
  if (created > 0) parts.push(`${String(created)} new ingredients, no rate yet`);
  if (dropped > 0) parts.push(`${String(dropped)} lines had no quantity and were left out`);

  return { message: `${parts.join(' · ')}.`, undoable: false, id };
}

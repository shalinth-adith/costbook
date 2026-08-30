'use server';

import { revalidatePath } from 'next/cache';

import { book, getMeta, getRecipe, saveIngredient, saveMeta, saveRecipe } from '@/lib/book';

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

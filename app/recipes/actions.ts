'use server';

import { revalidatePath } from 'next/cache';

import { getMeta, getRecipe, putMeta, putRecipe } from '@/lib/store';

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
  const recipe = getRecipe(id);
  const dish = getMeta(id);
  if (recipe === undefined || dish === undefined) {
    return { message: 'That recipe is no longer here.', undoable: false };
  }

  const copyId = `${id}-copy-${Date.now().toString(36)}`;
  const name = `${recipe.name} (copy)`;

  putRecipe({ ...recipe, id: copyId, name });
  putMeta(copyId, dish);
  // putMeta only patches what exists, so seed the copy's own entry first.
  putMeta(copyId, {
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
  const dish = getMeta(id);
  if (dish === undefined) return { message: 'That recipe is no longer here.', undoable: false };

  putMeta(id, archived ? { archived: true, onMenu: false } : { archived: false });
  refresh();

  return {
    message: archived
      ? 'Archived. It is off the menu and out of the list, and still linkable as a sub-recipe.'
      : 'Restored. It is back in the list, and still off the menu until you price it.',
    undoable: true,
  };
}

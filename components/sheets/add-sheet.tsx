'use client';

import type { Ingredient } from '@/core/ingredient';
import type { Pantry, Recipe } from '@/core/recipe';

import { ComponentPicker, type PickerChoice } from '../component-picker';
import { Sheet } from '../sheet';

/**
 * Add line.
 *
 * The picker, on the surface rather than under the table. A12 opens it as a
 * drawer so the lines already entered stay where they are instead of being
 * pushed down the screen by a list opening beneath them.
 */
export function AddSheet({
  open,
  onClose,
  shelf,
  recipes,
  pantry,
  excludeRecipeId,
  usedInCount,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  shelf: readonly Ingredient[];
  recipes: readonly Recipe[];
  pantry: Pantry;
  excludeRecipeId: string;
  usedInCount: (name: string) => number;
  onPick: (choice: PickerChoice) => void;
}) {
  return (
    <Sheet title="Add a component" open={open} onClose={onClose}>
      <ComponentPicker
        shelf={shelf}
        recipes={recipes}
        pantry={pantry}
        excludeRecipeId={excludeRecipeId}
        usedInCount={usedInCount}
        onPick={(choice) => { onPick(choice); onClose(); }}
        alwaysOpen
      />
      <p className="sheet-foot-note">
        A line marked <strong>SUB</strong> is another recipe of yours, with its own yield. Adding
        one links the two: change the sub and this dish moves with it.
      </p>
    </Sheet>
  );
}

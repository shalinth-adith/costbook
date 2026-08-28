import { notFound } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { RecipeSheet } from '@/components/recipe-sheet';
import { book, meta, pantry, recipes, shelf, usedInCount } from '@/lib/data';

/**
 * The cost sheet. Creating a dish and editing one are the same screen in two
 * states — same controls in the same slots, only size, weight and fill differ
 * between them (FLOWS 5.1). The alternative is an owner creating a dish on one
 * layout and meeting a different one next week with no explanation.
 *
 * This half only loads. Everything that responds lives in RecipeSheet.
 */
export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const recipe = book.get(id);
  const dish = meta[id];
  if (recipe === undefined || dish === undefined) notFound();

  // Usage counts are computed once here rather than in the browser: the client
  // holds one recipe, and this question is about all of them.
  const names = new Set<string>();
  for (const r of recipes) {
    for (const c of r.components) {
      if (c.kind === 'ingredient') names.add(pantry.ingredients.get(c.ingredientId)?.name ?? '');
      if (c.kind === 'recipe') names.add(book.get(c.childId)?.name ?? '');
    }
  }
  for (const i of shelf) names.add(i.name);
  const usageCounts = Object.fromEntries([...names].map((n) => [n, usedInCount(n)]));

  return (
    <AppShell current="Recipes">
      <RecipeSheet
        initialRecipe={recipe}
        otherRecipes={recipes}
        shelf={shelf}
        dish={dish}
        usageCounts={usageCounts}
      />
    </AppShell>
  );
}

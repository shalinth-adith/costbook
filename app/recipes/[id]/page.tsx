import { notFound } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { RecipeSheet } from '@/components/recipe-sheet';
import { usedInCount } from '@/lib/data';
import {
  allIngredients,
  allMeta,
  allRecipes,
  currencyCode,
  getMeta,
  getRecipe,
  orgModel,
  pantry,
} from '@/lib/store';
import { CurrencyProvider } from '@/components/currency-provider';
import { ingredientCost, ratePerUnit } from '@/core/ingredient';

/**
 * The cost sheet. Creating a dish and editing one are the same screen in two
 * states — same controls in the same slots, only size, weight and fill differ
 * between them (FLOWS 5.1). The alternative is an owner creating a dish on one
 * layout and meeting a different one next week with no explanation.
 *
 * This half only loads. Everything that responds lives in RecipeSheet.
 */
export const dynamic = 'force-dynamic';

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Read through the store, so a save is visible on the next request.
  const store = pantry();
  const recipe = getRecipe(id);
  const dish = getMeta(id);
  if (recipe === undefined || dish === undefined) notFound();

  // Usage counts are computed once here rather than in the browser: the client
  // holds one recipe, and this question is about all of them.
  const names = new Set<string>();
  for (const r of allRecipes()) {
    for (const c of r.components) {
      if (c.kind === 'ingredient') names.add(store.ingredients.get(c.ingredientId)?.name ?? '');
      if (c.kind === 'recipe') names.add(store.recipes.get(c.childId)?.name ?? '');
    }
  }
  for (const i of allIngredients()) names.add(i.name);
  const usageCounts = Object.fromEntries([...names].map((n) => [n, usedInCount(n)]));

  const code = currencyCode();
  const preview = allIngredients()
    .filter((i) => i.purchasePrice !== null)
    .slice(0, 3)
    .map((i) => ({
      label: i.name,
      amount: ratePerUnit(ingredientCost(i).ratePerBaseUnit, i.purchaseUnit) ?? 0,
      per: i.purchaseUnit,
    }));

  return (
    <AppShell current="Recipes" currencyCode={code} preview={preview}>
      <CurrencyProvider code={code}>
      <RecipeSheet
        initialRecipe={recipe}
        otherRecipes={allRecipes()}
        shelf={allIngredients()}
        dish={dish}
        usageCounts={usageCounts}
        orgModel={orgModel()}
      />
      </CurrencyProvider>
    </AppShell>
  );
}

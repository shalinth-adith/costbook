import { notFound } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { RecipeSheet } from '@/components/recipe-sheet';

import { book, orgModel, pantry } from '@/lib/book';
import { requireSetup } from '@/lib/guard';

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
  await requireSetup();
  const { id } = await params;

  const b = await book();
  const store = await pantry();

  const recipe = b.recipes.find((r) => r.id === id);
  const dish = b.meta[id];
  if (recipe === undefined || dish === undefined) notFound();

  /*
   * How many of the operator's own recipes reach each name.
   *
   * Computed here rather than in the browser: the client holds one recipe and
   * this is a question about all of them. Counted against the account's book —
   * it used to count against the fixture, which meant every real account saw
   * the same answer regardless of what it actually contained.
   */
  const usageCounts: Record<string, number> = {};
  const bump = (name: string) => {
    if (name === '') return;
    usageCounts[name] = (usageCounts[name] ?? 0) + 1;
  };
  for (const r of b.recipes) {
    const seen = new Set<string>();
    for (const c of r.components) {
      const name =
        c.kind === 'ingredient'
          ? (store.ingredients.get(c.ingredientId)?.name ?? '')
          : c.kind === 'recipe'
            ? (store.recipes.get(c.childId)?.name ?? '')
            : '';
      // Once per recipe: a dish listing onion twice still uses it once.
      if (name !== '' && !seen.has(name)) {
        seen.add(name);
        bump(name);
      }
    }
  }
  for (const i of b.ingredients) usageCounts[i.name] ??= 0;

  const code = b.org.currency;

  return (
    <AppShell
      orgName={b.org.name}
      current="Recipes"
      currencyCode={code}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      <CurrencyProvider code={code}>
        <RecipeSheet
          initialRecipe={recipe}
          otherRecipes={b.recipes}
          shelf={b.ingredients}
          dish={dish}
          usageCounts={usageCounts}
          orgModel={await orgModel()}
          orgCharges={b.org.charges}
          owner={b.members.find((mm) => mm.role === 'owner')?.name ?? 'the owner'}
          flags={b.flags.filter((f) => f.recipeId === id)}
          orgName={b.org.name}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

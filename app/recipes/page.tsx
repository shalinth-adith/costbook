import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { LibraryView } from '@/components/library-view';

import { book, orgModel, pantry } from '@/lib/book';
import { requireSetup } from '@/lib/guard';
import { library } from '@/lib/library';

import { archiveRecipe, createDish, duplicateRecipe } from './actions';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  await requireSetup();

  const b = await book();
  const model = await orgModel();
  const p = await pantry();

  const data = library({
    ids: b.recipes.map((r) => r.id),
    pantry: p,
    meta: b.meta,
    model,
  });

  return (
    <AppShell
      orgName={b.org.name}
      current="Recipes"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      <CurrencyProvider code={b.org.currency}>
        <LibraryView
          data={data}
          pantry={p}
          target={model.foodCostTarget}
          onDuplicate={duplicateRecipe}
          onArchive={archiveRecipe}
          onCreate={createDish}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

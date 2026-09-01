import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { LibraryView } from '@/components/library-view';

import { book, orgModel, pantry } from '@/lib/book';
import { requireSetup } from '@/lib/guard';
import { library } from '@/lib/library';

import { archiveRecipe, createDish, duplicateRecipe } from './actions';

export const dynamic = 'force-dynamic';

export default async function RecipesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSetup();

  /*
   * The new-dish sheet is a URL, not a piece of component state.
   *
   * A42's "Cost your first dish" has to land on the form itself rather than on
   * a list with a button to find. Driving it from the query means Back closes
   * it, and a link opened in a new tab behaves the same as a click — which a
   * mount effect cannot do, because it has no way to tell the two apart.
   */
  const q = (await searchParams) ?? {};
  const creating = q['new'] === '1';

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
          creating={creating}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

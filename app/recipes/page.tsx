import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { LibraryView } from '@/components/library-view';
import { library } from '@/lib/library';
import {
  allMeta,
  allRecipes,
  currencyCode,
  currencyIsSettable,
  orgModel,
  pantry,
  org,
} from '@/lib/store';

import { archiveRecipe, createDish, duplicateRecipe } from './actions';

export const dynamic = 'force-dynamic';

/**
 * A16. Everything the kitchen has a recipe for, grouped for retrieval.
 *
 * Costed on the server: this screen answers a question about the whole book
 * and nothing on it is being edited.
 */
export default function RecipesPage() {
  const model = orgModel();
  const store = pantry();
  const code = currencyCode();

  const data = library({
    ids: allRecipes().map((r) => r.id),
    pantry: store,
    meta: allMeta(),
    model,
  });

  return (
    <AppShell
      orgName={org().name}
      current="Recipes"
      currencyCode={code}
      currencySettable={currencyIsSettable()}
      dishCount={allRecipes().length}
    >
      <CurrencyProvider code={code}>
        <LibraryView
          data={data}
          pantry={store}
          target={model.foodCostTarget}
          onDuplicate={duplicateRecipe}
          onArchive={archiveRecipe}
          onCreate={createDish}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

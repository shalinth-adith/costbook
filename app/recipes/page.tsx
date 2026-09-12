import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { LibraryView } from '@/components/library-view';

import { book, orgModel, pantry } from '@/lib/book';
import { dashboard } from '@/lib/dashboard';
import { requireSetup } from '@/lib/guard';
import { library } from '@/lib/library';
import { canTakeAway } from '@/lib/plan';
import { type Pile, pilesOf } from '@/lib/profit';

import { archiveRecipe, createDish, duplicateRecipe } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The dashboard's counts, as a URL.
 *
 * A count is a question — "which seven?" — and until now the only answer was a
 * drawer that listed them again. Sending the operator to the list they already
 * know how to search, sort and act in is the shorter road, and it survives a
 * refresh, a bookmark and a Back button, which a drawer does not.
 */
const PILE_SAID: Readonly<Record<string, { readonly key: Pile; readonly said: string } | undefined>> = {
  earning: { key: 'earning', said: 'earning what you wanted' },
  thin: { key: 'thin', said: 'earning less than you asked for' },
  losing: { key: 'losing', said: 'going out at a loss' },
  unpriced: { key: 'unpriced', said: 'still needing a price from you' },
};

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
  const show = typeof q['show'] === 'string' ? q['show'] : null;
  // What the ingredients screen sends under "See the recipes".
  const asked = typeof q['q'] === 'string' ? q['q'] : '';

  const b = await book();
  const model = await orgModel();
  const p = await pantry();

  const data = library({
    ids: b.recipes.map((r) => r.id),
    pantry: p,
    meta: b.meta,
    model,
  });

  /*
   * Arrived from a dashboard count.
   *
   * The pile is worked out here with the same `pilesOf` the dashboard used,
   * over rows from the same `dashboard()` — not restated as a filter over
   * library rows. `standingOf` earns its care: an empty recipe costs 0.00,
   * which is not null, and reading that as a perfect margin once put an
   * uncosted dish at the top of "earning what you wanted". A second copy of
   * that judgement would be free to drift from the first, and the two screens
   * would disagree about the same seven dishes.
   */
  const pile = PILE_SAID[show ?? ''];
  const only =
    pile === undefined
      ? undefined
      : new Set(
          pilesOf(
            dashboard({ ids: b.recipes.map((r) => r.id), pantry: p, meta: b.meta, model }).rows,
            model.foodCostTarget,
          )[pile.key].map((s) => s.row.id),
        );

  return (
    <AppShell
      orgName={b.org.name}
      current="Recipes"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
      plan={b.plan}
    >
      <CurrencyProvider code={b.org.currency}>
        <LibraryView
          asked={asked}
          data={data}
          pantry={p}
          target={model.foodCostTarget}
          onDuplicate={duplicateRecipe}
          onArchive={archiveRecipe}
          onCreate={createDish}
          canTake={canTakeAway(b.subscription)}
          creating={creating}
          only={only}
          onlySaid={pile?.said}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

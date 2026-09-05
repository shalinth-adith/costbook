import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { IngredientsView } from '@/components/ingredients-view';
import { type IngredientFilter, board } from '@/lib/ingredients';
import { FREE_LIMITS } from '@/lib/org';
import { book, pantry } from '@/lib/book';

import { addIngredient, previewRate, setRate, setRateAndRaise, setRates, setYield } from './actions';
import { requireSetup } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** A19. One ingredient, entered once, priced once. */
export default async function IngredientsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSetup();

  // The worklist links here with the job it sent somebody to do.
  const q = (await searchParams) ?? {};
  const asked = q['show'];
  const startFilter: IngredientFilter = asked === 'assumed' ? 'assumed' : 'all';

  const b = await book();
  const code = b.org.currency;
  const today = new Date().toISOString().slice(0, 10);
  const depth = b.plan === 'free' ? FREE_LIMITS.rateHistory : undefined;

  const data = board(
    b.ingredients,
    await pantry(),
    today,
    (id) => {
      const log = b.history[id] ?? [];
      return depth === undefined ? log : log.slice(0, depth);
    },
    b.org.staleAfterDays,
  );

  return (
    <AppShell
      orgName={b.org.name}
      current="Ingredients"
      currencyCode={code}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      <CurrencyProvider code={code}>
        <IngredientsView
          board={data}
          onAdd={addIngredient}
          onSetRate={setRate}
          onPreviewRate={previewRate}
          onSetRateAndRaise={setRateAndRaise}
          currencyCode={code}
          startFilter={startFilter}
          onSetRates={setRates}
          onSetYield={setYield}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

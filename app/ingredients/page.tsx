import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { IngredientsView } from '@/components/ingredients-view';
import { board } from '@/lib/ingredients';
import { FREE_LIMITS } from '@/lib/org';
import {
  allIngredients,
  allRecipes,
  currencyCode,
  currencyIsSettable,
  pantry,
  org,
  plan,
  rateHistory,
} from '@/lib/store';

import { addIngredient, previewRate, setRate, setRates, setYield } from './actions';
import { requireSetup } from '@/lib/guard';

export const dynamic = 'force-dynamic';

/** A19. One ingredient, entered once, priced once. */
export default function IngredientsPage() {
  requireSetup();
  const code = currencyCode();
  const today = new Date().toISOString().slice(0, 10);
  const data = board(allIngredients(), pantry(), today, (id) =>
    rateHistory(id, plan() === 'free' ? FREE_LIMITS.rateHistory : undefined),
  );

  return (
    <AppShell
      orgName={org().name}
      current="Ingredients"
      currencyCode={code}
      currencySettable={currencyIsSettable()}
      dishCount={allRecipes().length}
    >
      <CurrencyProvider code={code}>
        <IngredientsView
          board={data}
          onAdd={addIngredient}
          onSetRate={setRate}
          onPreviewRate={previewRate}
          currencyCode={code}
          onSetRates={setRates}
          onSetYield={setYield}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

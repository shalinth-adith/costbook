import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { IngredientsView } from '@/components/ingredients-view';
import { board } from '@/lib/ingredients';
import {
  allIngredients,
  allRecipes,
  currencyCode,
  currencyIsSettable,
  pantry,
  org,
} from '@/lib/store';

import { addIngredient, previewRate, setRate, setRates, setYield } from './actions';

export const dynamic = 'force-dynamic';

/** A19. One ingredient, entered once, priced once. */
export default function IngredientsPage() {
  const code = currencyCode();
  const today = new Date().toISOString().slice(0, 10);
  const data = board(allIngredients(), pantry(), today);

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

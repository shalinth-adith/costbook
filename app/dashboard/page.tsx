import { AppShell } from '@/components/app-shell';
import { DashboardView } from '@/components/dashboard-view';
import { DEFAULT_MODEL } from '@/lib/costing';
import { ORG } from '@/lib/data';
import {
  allIngredients,
  allMeta,
  allRecipes,
  currencyCode,
  currencyIsSettable,
  orgModel,
  pantry,
} from '@/lib/store';
import { CurrencyProvider } from '@/components/currency-provider';
import { dashboard } from '@/lib/dashboard';

/**
 * Home. Every dish, worst food cost first, read against one target line.
 *
 * Costed on the server — this screen answers a question about the whole menu,
 * and nothing on it is being edited.
 */
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const model = { ...DEFAULT_MODEL, ...orgModel(), foodCostTarget: ORG.foodCostTarget };
  // Read through the store, so a dish saved a moment ago is here.
  const data = dashboard({
    ids: allRecipes().map((r) => r.id),
    pantry: pantry(),
    meta: allMeta(),
    model,
  });

  const code = currencyCode();


  return (
    <AppShell current="Dashboard" currencyCode={code} currencySettable={currencyIsSettable()} dishCount={allRecipes().length}>
      <CurrencyProvider code={code}>
        <DashboardView data={data} target={model.foodCostTarget} />
      </CurrencyProvider>
    </AppShell>
  );
}

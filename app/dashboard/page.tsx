import { AppShell } from '@/components/app-shell';
import { DashboardView } from '@/components/dashboard-view';
import {
  allIngredients,
  allMeta,
  allRecipes,
  currencyCode,
  currencyIsSettable,
  orgModel,
  pantry,
  org,
} from '@/lib/store';
import { CurrencyProvider } from '@/components/currency-provider';
import { dashboard } from '@/lib/dashboard';
import { requireSetup } from '@/lib/guard';

/**
 * Home. Every dish, worst food cost first, read against one target line.
 *
 * Costed on the server — this screen answers a question about the whole menu,
 * and nothing on it is being edited.
 */
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  requireSetup();
  const model = orgModel();
  // Read through the store, so a dish saved a moment ago is here.
  const data = dashboard({
    ids: allRecipes().map((r) => r.id),
    pantry: pantry(),
    meta: allMeta(),
    model,
  });

  const code = currencyCode();


  return (
    <AppShell orgName={org().name} current="Dashboard" currencyCode={code} currencySettable={currencyIsSettable()} dishCount={allRecipes().length}>
      <CurrencyProvider code={code}>
        <DashboardView data={data} target={model.foodCostTarget} />
      </CurrencyProvider>
    </AppShell>
  );
}

import { AppShell } from '@/components/app-shell';
import { DashboardView } from '@/components/dashboard-view';
import { DEFAULT_MODEL } from '@/lib/costing';
import { ORG } from '@/lib/data';
import {
  allIngredients,
  allMeta,
  allRecipes,
  currencyCode,
  orgModel,
  pantry,
} from '@/lib/store';
import { ratePerUnit, ingredientCost } from '@/core/ingredient';
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

  // Real figures from this operator's own menu, so a conversion can be seen
  // before it is made rather than described in the abstract.
  const preview = [
    ...allIngredients()
      .filter((i) => i.purchasePrice !== null)
      .slice(0, 2)
      .map((i) => ({
        label: i.name,
        amount: ratePerUnit(ingredientCost(i).ratePerBaseUnit, i.purchaseUnit) ?? 0,
        per: i.purchaseUnit,
      })),
    ...data.rows
      .filter((r) => r.sellingPrice !== null)
      .slice(0, 1)
      .map((r) => ({ label: `${r.name}, menu price`, amount: r.sellingPrice ?? 0, per: null })),
  ];

  return (
    <AppShell current="Dashboard" currencyCode={code} preview={preview}>
      <CurrencyProvider code={code}>
        <DashboardView data={data} target={model.foodCostTarget} />
      </CurrencyProvider>
    </AppShell>
  );
}

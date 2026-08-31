import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { DashboardView } from '@/components/dashboard-view';
import { KitchenCard } from '@/components/kitchen-card';

import { book, orgModel, pantry } from '@/lib/book';
import { dashboard } from '@/lib/dashboard';
import { requireSetup } from '@/lib/guard';

/**
 * Home. Every dish, worst food cost first, read against one target line.
 *
 * Costed on the server — this screen answers a question about the whole menu,
 * and nothing on it is being edited.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requireSetup();

  const b = await book();
  const model = await orgModel();

  const data = dashboard({
    ids: b.recipes.map((r) => r.id),
    pantry: await pantry(),
    meta: b.meta,
    model,
  });

  return (
    <AppShell
      orgName={b.org.name}
      current="Dashboard"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      <CurrencyProvider code={b.org.currency}>
        {/* Above the numbers, where the owner already is (A40). */}
        <KitchenCard flags={b.flags} today={new Date().toISOString().slice(0, 10)} />
        <DashboardView data={data} target={model.foodCostTarget} />
      </CurrencyProvider>
    </AppShell>
  );
}

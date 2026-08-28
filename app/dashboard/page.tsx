import { AppShell } from '@/components/app-shell';
import { DashboardView } from '@/components/dashboard-view';
import { DEFAULT_MODEL } from '@/lib/costing';
import { ORG, dishIds, meta, pantry } from '@/lib/data';
import { dashboard } from '@/lib/dashboard';

/**
 * Home. Every dish, worst food cost first, read against one target line.
 *
 * Costed on the server — this screen answers a question about the whole menu,
 * and nothing on it is being edited.
 */
export default function DashboardPage() {
  const model = { ...DEFAULT_MODEL, foodCostTarget: ORG.foodCostTarget };
  const data = dashboard({ ids: dishIds, pantry, meta, model });

  return (
    <AppShell current="Dashboard">
      <DashboardView data={data} target={model.foodCostTarget} />
    </AppShell>
  );
}

import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { SettingsView } from '@/components/settings-view';

import { STALE_AFTER_DAYS } from '@/core/ingredient';

import {
  allIngredients,
  allRecipes,
  currencyCode,
  currencyIsSettable,
  members,
  org,
  orgModel,
  plan,
} from '@/lib/store';

/**
 * Settings — the ninth screen, and where `core/charges.ts` finally reaches a
 * user. An index rather than a path: nothing here is only reachable from here.
 */
export const dynamic = 'force-dynamic';

export default function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  void searchParams;

  const code = currencyCode();
  const o = org();
  const model = orgModel();
  const recipes = allRecipes();
  const ingredients = allIngredients();

  const stale = ingredients.filter((i) => {
    if (i.pricedAt === undefined) return false;
    const days = (Date.now() - Date.parse(i.pricedAt)) / 86_400_000;
    return days > (o.staleAfterDays || STALE_AFTER_DAYS);
  }).length;

  const first = recipes[0];

  return (
    <AppShell
      orgName={o.name}
      current="Settings"
      currencyCode={code}
      currencySettable={currencyIsSettable()}
      dishCount={recipes.length}
    >
      <CurrencyProvider code={code}>
        <SettingsView
          currencyCode={code}
          data={{
            org: o,
            model,
            members: members(),
            plan: plan(),
            recipeCount: recipes.length,
            ingredientCount: ingredients.length,
            staleCount: stale,
            sample: first === undefined
              ? null
              : { name: first.name, ingredients: first.components.length, portions: first.portions },
          }}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

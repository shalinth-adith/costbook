import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { SettingsView } from '@/components/settings-view';

import { STALE_AFTER_DAYS } from '@/core/ingredient';

import { book, orgModel } from '@/lib/book';
import { requireSetup } from '@/lib/guard';

/**
 * Settings — the ninth screen, and where `core/charges.ts` finally reaches a
 * user. An index rather than a path: nothing here is only reachable from here.
 */
export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSetup();
  void searchParams;

  const b = await book();
  const model = await orgModel();
  const code = b.org.currency;
  const o = b.org;
  const recipes = b.recipes;
  const ingredients = b.ingredients;

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
      currencySettable={recipes.length === 0}
      dishCount={recipes.length}
    >
      <CurrencyProvider code={code}>
        <SettingsView
          currencyCode={code}
          data={{
            org: o,
            model,
            members: b.members,
            plan: b.plan,
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

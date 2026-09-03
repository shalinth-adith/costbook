import { AppShell } from '@/components/app-shell';
import { CurrencyProvider } from '@/components/currency-provider';
import { SettingsView } from '@/components/settings-view';

import { STALE_AFTER_DAYS } from '@/core/ingredient';

import { book, orgModel } from '@/lib/book';
import { tryRecipeCost } from '@/lib/costing';
import { pantryWith } from '@/lib/edit';
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

  /**
   * One real dish for the worked example under the formula (A27).
   *
   * "This is your dish and your rates, not an illustration" is only true if it
   * is costed rather than counted, so the ingredient cost per portion comes
   * from the engine. The first dish that actually costs — one missing a rate
   * would print a floor where the example promises a cost.
   */
  const sample = (() => {
    for (const r of recipes) {
      if (r.portions === null || r.portions <= 0) continue;
      const attempt = tryRecipeCost(r, pantryWith(r, recipes, ingredients));
      // A floor is not a cost. An example built on one would print a figure
      // the sentence above it calls a plate cost, and it would be a minimum.
      if (!attempt.ok || attempt.cost.kind !== 'cost') continue;
      const perPortion = attempt.cost.perPortion;
      if (perPortion === null || perPortion <= 0) continue;
      return { name: r.name, ingredientCost: perPortion };
    }
    return null;
  })();

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
            role: b.role,
            recipeCount: recipes.length,
            ingredientCount: ingredients.length,
            staleCount: stale,
            sample,
          }}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

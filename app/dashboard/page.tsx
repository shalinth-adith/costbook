import { AppShell } from "@/components/app-shell";
import { CurrencyProvider } from "@/components/currency-provider";
import { DashboardView, type StaleRate } from "@/components/dashboard-view";
import { KitchenCard } from "@/components/kitchen-card";

import { book, orgModel, pantry } from "@/lib/book";
import { dashboard } from "@/lib/dashboard";
import { firstDish } from "@/lib/first-dish";
import { requireSetup } from "@/lib/guard";
import { STALE_AFTER_DAYS } from "@/core/ingredient";
import { recent } from "@/lib/recent";
import { spread, worstOffenders } from "@/lib/spread";

/**
 * Home. What moved, and what it moved.
 *
 * Costed on the server — this screen answers a question about the whole menu
 * twice over, once as it stands and once as it stood a month ago, and nothing
 * on it is being edited.
 */
export const dynamic = "force-dynamic";

/**
 * How far back "recently" reaches.
 *
 * A rolling window rather than a per-user seen marker. The marker would be
 * truer — an owner visiting twice in an hour would get an honestly empty
 * screen the second time, the way the flags table already tracks `seenAt` —
 * but it needs a column nothing records yet. Thirty days needs no migration,
 * and it matches the rhythm FLOWS 1 gives the owner's loop: weekly or monthly.
 */
const WINDOW_DAYS = 30;

/** Enough stale rates to prompt a look, not so many it becomes a second list. */
const STALE_SHOWN = 6;

export default async function DashboardPage() {
  await requireSetup();

  const b = await book();
  const model = await orgModel();

  const shelf = await pantry();
  const today = new Date().toISOString().slice(0, 10);

  const data = dashboard({
    ids: b.recipes.map((r) => r.id),
    pantry: shelf,
    meta: b.meta,
    model,
  });

  /*
   * The change data the old screen was never handed.
   *
   * `dashboard()` takes `{ ids, pantry, meta, model }` — no history and no
   * dates — so the screen whose job is noticing change could only ever render
   * a static ranking. The history has been loaded on every request the whole
   * time; it just went nowhere.
   */
  const moved = recent({
    recipes: b.recipes,
    ingredients: b.ingredients,
    meta: b.meta,
    model,
    history: b.history,
    today,
    days: WINDOW_DAYS,
  });

  const staleAfter = b.org.staleAfterDays || STALE_AFTER_DAYS;
  const dayMs = 24 * 60 * 60 * 1000;

  /*
   * Rates the book is now trusting on the operator's behalf.
   *
   * Counted in Settings and filterable on Ingredients, and never once said
   * where it would prompt anybody to act. Staleness is the mechanism by which
   * a costed menu quietly stops being true.
   */
  const stale: StaleRate[] = b.ingredients
    .flatMap((i) => {
      const last = b.history[i.id]?.[0]?.on;
      if (last === undefined) return [];
      const days = Math.floor(
        (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last}T00:00:00Z`)) /
          dayMs,
      );
      return days > staleAfter ? [{ id: i.id, name: i.name, days }] : [];
    })
    .sort((a, c) => c.days - a.days)
    .slice(0, STALE_SHOWN);

  /**
   * A42 — where "start with one dish" lands.
   *
   * Null once a second dish is costed. A screen about change has nothing to
   * report on a book that has not happened yet.
   */
  const first = firstDish({
    recipes: b.recipes,
    pantry: shelf,
    meta: b.meta,
    model,
    history: b.history,
    ingredientCount: b.ingredients.length,
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
        {/* Above the numbers, where the owner already is (A40). The only thing
            on this page that came from another person. */}
        <KitchenCard flags={b.flags} today={today} />
        <DashboardView
          orgName={b.org.name}
          moved={moved}
          stats={data.stats}
          spread={spread(data.rows, model.foodCostTarget)}
          worst={worstOffenders(data.rows)}
          stale={stale}
          staleAfterDays={staleAfter}
          target={model.foodCostTarget}
          first={first}
          today={today}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

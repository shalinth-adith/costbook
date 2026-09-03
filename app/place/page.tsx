import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { CurrencyProvider } from "@/components/currency-provider";
import { PlaceView } from "@/components/place-view";

import { book, orgModel, pantry } from "@/lib/book";
import { requireSetup } from "@/lib/guard";
import { library } from "@/lib/library";
import { placeOf, stanceOf } from "@/lib/place";

export const metadata: Metadata = { title: "Your place · Costbook" };

export const dynamic = "force-dynamic";

/**
 * The page behind the wordmark.
 *
 * The mark used to lead to /dashboard — the same destination as the Dashboard
 * item in the nav row beside it, so it was a second button for somewhere the
 * operator could already go. It had a special case for that: pressing it while
 * already on the dashboard scrolled to the top instead of navigating, which is
 * a workaround for the duplication rather than a fix for it.
 *
 * It leads here instead. "Your place" is the product's own phrase — setup step
 * one asks "What's your place called?" — so the mark now goes to the thing it
 * is a mark *of*.
 *
 * Costed on the server. Nothing on this page is edited.
 */
export default async function PlacePage() {
  await requireSetup();

  const b = await book();
  const model = await orgModel();
  const p = await pantry();

  /*
   * Through `library()` rather than counting recipes directly, so this page
   * and the Recipes screen cannot disagree about what a dish is. The dish /
   * batch line — portions null means a batch — is drawn in one place, and a
   * second copy of it here would drift the first time somebody changed it.
   */
  const rows = library({
    ids: b.recipes.map((r) => r.id),
    pantry: p,
    meta: b.meta,
    model,
  });

  const place = placeOf({
    org: b.org,
    rows: [...rows.dishes, ...rows.batches],
    ingredientCount: b.ingredients.length,
  });

  return (
    <AppShell
      orgName={b.org.name}
      current="Place"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      <CurrencyProvider code={b.org.currency}>
        <PlaceView place={place} stance={stanceOf(b.org)} />
      </CurrencyProvider>
    </AppShell>
  );
}

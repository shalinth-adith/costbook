import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { CurrencyProvider } from "@/components/currency-provider";
import { NewDishView } from "@/components/new-dish-view";

import { book } from "@/lib/book";
import { requireSetup } from "@/lib/guard";

import { createDishFromPaste } from "../actions";

export const metadata: Metadata = { title: "New dish · Costbook" };

export const dynamic = "force-dynamic";

/**
 * A screen, because creating a dish is the work and not an interruption.
 *
 * It was a modal over the library: a name, a portion count, and out — leaving
 * an empty dish on a blank cost sheet to be filled a line at a time through a
 * picker. Every study of this product category says the same thing about that
 * shape of entry: it is what operators quit over.
 *
 * The shelf and the recipe list are handed to the browser whole so the paste
 * can be read as it is typed. That is affordable — a café has on the order of
 * 250 ingredients and 150 recipes, the matching is a map lookup, and the
 * alternative is a round trip per keystroke on the screen that most needs to
 * feel immediate.
 */
export default async function NewDishPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string }>;
}) {
  await requireSetup();
  // `?tour=1` runs the first-dish tour on any book: the way back in for
  // somebody who skipped it, and how it is shown to anyone who asks.
  const { tour } = await searchParams;

  const b = await book();

  return (
    <AppShell
      orgName={b.org.name}
      current="Recipes"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
      plan={b.plan}
    >
      <CurrencyProvider code={b.org.currency}>
        <NewDishView
          shelf={b.ingredients}
          recipes={b.recipes}
          onCreate={createDishFromPaste}
          tourForced={tour === "1"}
        />
      </CurrencyProvider>
    </AppShell>
  );
}

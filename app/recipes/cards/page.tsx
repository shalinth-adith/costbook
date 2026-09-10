import type { Metadata } from "next";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { AllCards } from "@/components/all-cards";

import { book, pantry } from "@/lib/book";
import { breakdown } from "@/lib/breakdown";

import { requireSetup } from "@/lib/guard";
import { EXPORT_PASS } from "@/lib/org";
import { canTakeAway } from "@/lib/plan";
import { allergensFrom, doNotFrom, methodLines, prepTimeFrom } from "@/lib/prep";

export const metadata: Metadata = { title: "Every prep card · Costbook" };
export const dynamic = "force-dynamic";

/**
 * The whole folder, in one press.
 *
 * A prep card at a time is right when a dish changes. Opening a kitchen, or
 * handing a new chef the book, is a different job — and doing it a dish at a
 * time is twelve visits to a printer. This is every dish that plates,
 * one card a page, in the order the menu is read.
 *
 * Batches are left out. A sub-recipe is not a dish anybody serves, and it
 * already prints inside every card that reaches it — a folder that carried a
 * card for the decoction as well as for the coffee would be filed twice and
 * followed once.
 */
export default async function CardsPage() {
  await requireSetup();

  const b = await book();
  const shelf = await pantry();
  const canTake = canTakeAway(b.subscription);

  const cards = b.recipes
    .filter((r) => r.portions !== null)
    .flatMap((recipe) => {
      const meta = b.meta[recipe.id];
      // A dish with no meta row has never been opened; there is nothing to
      // print on a card for it and an empty card is worse than none.
      if (meta === undefined) return [];
      return [
        {
          id: recipe.id,
          name: recipe.name,
          dish: meta,
          portions: recipe.portions,
          lines: breakdown(recipe, shelf),
          steps: methodLines(meta.method),
          /*
           * Prep time, allergens and the do-not live under the operator's own
           * headings in `custom`, read by the same three functions the dish
           * screen reads them with. A second way of finding them here would be
           * a second answer the first time somebody renamed a column.
           */
          prepTime: prepTimeFrom(meta.custom),
          contains: allergensFrom(meta.custom),
          doNot: doNotFrom(meta.custom),
        },
      ];
    })
    .sort(
      (a, b2) =>
        a.dish.category.localeCompare(b2.dish.category) ||
        a.name.localeCompare(b2.name),
    );

  return (
    <AppShell
      orgName={b.org.name}
      current="Recipes"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      {canTake ? (
        <AllCards cards={cards} orgName={b.org.name} />
      ) : (
        /*
         * Locked, and honest about what is behind it: the count, the fact
         * that they are already written, and the one price. A wall that does
         * not say what is on the other side is a wall somebody leaves at.
         */
        <div className="page">
          <div className="cards-locked">
            <p className="wiz-live-label">Every prep card</p>
            <h1 className="cards-locked-h">
              <b className="figure">{cards.length}</b>{" "}
              {cards.length === 1 ? "card is" : "cards are"} written and
              waiting.
            </h1>
            <p className="cards-locked-copy">
              One card a dish, each opened down to what is actually on the
              shelf, ready to print and tape up. They are drawn from what you
              have already costed — nothing here is written twice. Taking them
              off the screen is bought once on a free book, and it stays bought.
            </p>
            <div className="cards-locked-act">
              <Link href="/plans#takeaway" className="btn btn-primary btn-lg">
                Unlock it · {EXPORT_PASS.symbol}
                {EXPORT_PASS.amount} once
              </Link>
              <Link href="/recipes" className="link">
                Back to the menu
              </Link>
            </div>
            <p className="cards-locked-note">
              Every card is still readable one at a time, on the dish itself.
              What is bought is carrying them away.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  );
}

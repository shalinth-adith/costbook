"use client";

import Link from "next/link";

import type { BreakdownLine } from "@/lib/breakdown";
import type { DishMeta } from "@/lib/data";
import type { MethodLine } from "@/lib/prep";

import { PrepSheet } from "./prep-card";

/**
 * Every card, one to a page.
 *
 * The same sheet the dish screen prints, repeated — not a second layout of
 * the same facts. `PrepSheet` is the document; this is a frame that holds
 * several of them and a bar that sends the lot to the printer.
 *
 * `break-after: page` between them is what makes this a folder rather than a
 * scroll: a card that runs across a page break is a card a cook reads half of.
 */
export interface CardData {
  readonly id: string;
  readonly name: string;
  readonly dish: DishMeta;
  readonly portions: number | null;
  readonly lines: readonly BreakdownLine[];
  readonly steps: readonly MethodLine[];
  readonly prepTime: string | null;
  readonly contains: readonly string[];
  readonly doNot: string | null;
}

export function AllCards({
  cards,
  orgName,
}: {
  cards: readonly CardData[];
  orgName: string;
}) {
  if (cards.length === 0) {
    return (
      <div className="page">
        <div className="cards-locked">
          <p className="wiz-live-label">Every prep card</p>
          <h1 className="cards-locked-h">Nothing plates yet.</h1>
          <p className="cards-locked-copy">
            A prep card is printed for a dish that goes out on a plate.
            Everything in the book so far is a batch — something made to go
            inside something else — and those print inside the card of every
            dish that reaches them.
          </p>
          <div className="cards-locked-act">
            <Link href="/recipes/new" className="btn btn-primary btn-lg">
              Cost a dish
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cards">
      <div className="cards-bar no-print">
        <div>
          <p className="wiz-live-label">Every prep card</p>
          <h1 className="cards-h1">
            <b className="figure">{cards.length}</b> cards, one to a page
          </h1>
          <p className="cards-said">
            In menu order, each opened down to what is on the shelf. Print the
            lot, or use your printer&rsquo;s page range for the section you
            want.
          </p>
        </div>
        <div className="cards-act">
          <Link href="/recipes" className="btn">
            Back to the menu
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6.2 7V4.4h7.6V7M5 7h10v9.2H5Z" />
              <path d="M7.6 11.4h4.8" />
            </svg>
            Print all {cards.length}
          </button>
        </div>
      </div>

      <div className="cards-run">
        {cards.map((c) => (
          <PrepSheet
            key={c.id}
            name={c.name}
            dish={c.dish}
            portions={c.portions}
            lines={c.lines}
            steps={c.steps}
            prepTime={c.prepTime}
            contains={c.contains}
            doNot={c.doNot}
            orgName={orgName}
          />
        ))}
      </div>
    </div>
  );
}

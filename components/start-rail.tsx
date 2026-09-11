"use client";

import Link from "next/link";

import { EXPORT_PASS, FREE_LIMITS } from "@/lib/org";
import type { Start } from "@/lib/start";

import { useMoney } from "./currency-provider";

/**
 * The one thing to do next, for as long as the book is new.
 *
 * Not a checklist and not a tour. A new owner's problem is not "how does this
 * app work" — it is "I do not know what my dishes cost" — so this says one
 * sentence and offers one button, and the sentence is drawn from what is
 * actually true of their book rather than from a script.
 *
 * It sits above the figures because until there are figures worth reading it
 * IS the screen, and it disappears the moment the book is paid for.
 */
export function StartRail({
  start,
  used,
  target,
}: {
  start: Start;
  /** Recipes against the cap, counted the way the cap counts them. */
  used: number;
  /** The supplier share of every hundred the owner is aiming at. */
  target: number;
}) {
  const m = useMoney();
  const left = Math.max(0, FREE_LIMITS.recipes - used);

  if (start.kind === "none") {
    return (
      <Card
        step="Start here"
        h="Cost one dish."
        p={`Pick the one you sell most of. You will need what you pay for each thing that goes into it — a bill or a packet is enough. ${String(FREE_LIMITS.recipes)} dishes are free, which is enough to see whether this is true for your kitchen.`}
        to="/recipes/new"
        act="Cost a dish"
        left={left}
      />
    );
  }

  if (start.kind === "unpriced") {
    return (
      <Card
        step="Next"
        h={
          start.stuck === 1
            ? `${start.first} is missing a rate.`
            : `${String(start.stuck)} dishes are missing a rate.`
        }
        /* Said plainly because it is the difference between a number and a
           guess, and an owner who does not know that will trust the guess. */
        p="Until every ingredient under a dish has a price, its cost is a floor and not a cost — and the food cost drawn from it would be wrong in the direction that loses money quietly."
        to={`/recipes/${start.firstId}`}
        act={`Open ${start.first}`}
        left={left}
      />
    );
  }

  if (start.kind === "unsold") {
    return (
      <Card
        step="Next"
        h={
          start.without === 1
            ? `${start.first} has no selling price.`
            : `${String(start.without)} dishes have no selling price.`
        }
        p="Costbook knows what it costs you. Tell it what a guest pays and it can say what you keep — which is the number this was built for."
        to={`/recipes/${start.firstId}`}
        act={`Price ${start.first}`}
        left={left}
      />
    );
  }

  /* The reward. The first thing the product says that the owner did not
     already know, so it leads with the figure and not with an instruction. */
  const pct = start.dish.foodCostPercent;
  return (
    <section className="begin" data-tone={start.over ? "over" : "under"}>
      <div className="begin-main">
        <p className="begin-step">
          {start.atLimit ? "Your six are costed" : "Reading"}
        </p>
        <h2 className="begin-h">
          <b className="figure">{start.dish.name}</b> hands{" "}
          <b className="figure">{pct === null ? "—" : pct.toFixed(1)}</b> of
          every 100 to suppliers.
        </h2>
        <p className="begin-p">
          {start.over
            ? `Above the ${String(target)} you set at setup, so this is the dish worth a minute. `
            : `Inside the ${String(target)} you set at setup, so nothing here is leaking. `}
          {start.dish.costPerPortion !== null && start.dish.sellingPrice !== null ? (
            <>
              It costs you {m.withSymbol(start.dish.costPerPortion)} and sells
              at {m.withSymbol(start.dish.sellingPrice)}.
            </>
          ) : null}
        </p>
        <div className="begin-act">
          <Link href={`/recipes/${start.dish.id}`} className="btn btn-primary">
            Open {start.dish.name}
          </Link>
          {start.atLimit ? (
            <Link href="/plans" className="btn">
              What a plan opens
            </Link>
          ) : (
            <Link href="/recipes/new" className="btn">
              Cost another
            </Link>
          )}
        </div>
      </div>

      {/*
        * What is bought, said once, where it is relevant.
        *
        * Only at the limit — before that it is an advertisement interrupting
        * somebody who is working. At the limit it is the answer to the
        * question they are about to ask.
        */}
      {start.atLimit ? (
        <aside className="begin-buy">
          <p className="begin-buy-h">Taking it with you</p>
          <p className="begin-buy-p">
            Reading stays free. Printing the prep cards and downloading the
            menu as a spreadsheet is bought once — {EXPORT_PASS.symbol}
            {EXPORT_PASS.amount} — and kept, including if a stretch ends.
          </p>
          <Link href="/plans#takeaway" className="link">
            What that opens
          </Link>
        </aside>
      ) : null}
    </section>
  );
}

/** One step: a label, a sentence, one action, and how much trial is left. */
function Card({
  step,
  h,
  p,
  to,
  act,
  left,
}: {
  step: string;
  h: string;
  p: string;
  to: string;
  act: string;
  left: number;
}) {
  return (
    <section className="begin">
      <div className="begin-main">
        <p className="begin-step">{step}</p>
        <h2 className="begin-h">{h}</h2>
        <p className="begin-p">{p}</p>
        <div className="begin-act">
          <Link href={to} className="btn btn-primary">
            {act}
          </Link>
          {/*
            * The count, in words, beside the action rather than in a banner.
            * Zero left is not said here — at the limit the reading card is
            * showing instead, and it says it properly.
            */}
          {left > 0 ? (
            <span className="begin-left">
              <b className="figure">{left}</b> of{" "}
              <b className="figure">{FREE_LIMITS.recipes}</b> free dishes left
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

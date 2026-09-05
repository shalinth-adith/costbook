"use client";

import Link from "next/link";

import { periodSaid } from "@/lib/engineering";
import type { MonthCompare } from "@/lib/month";

import { useMoney } from "./currency-provider";

/**
 * What last month did to the plate costs, against the month before it.
 *
 * The dashboard already says what moved in the last thirty days, which is
 * the right question on a Tuesday. This is the one a kitchen that closes its
 * books each month asks instead, and the product could not answer it: a fixed
 * window with an edge, so the answer does not slide out from under yesterday's.
 *
 * It says what it does not know. Recipes are not versioned, so this is what
 * the dishes as they stand today would have cost at each month's rates —
 * which isolates exactly one thing, what the suppliers did, and is the thing
 * a monthly costing is actually asking about.
 */
export function MonthCard({ month }: { month: MonthCompare }) {
  const m = useMoney();
  const said = periodSaid(month.period);
  const against = periodSaid(month.against);

  if (month.rateMoves === 0) {
    return (
      <section className="card mc">
        <p className="mc-label">
          {said}, against {against}
        </p>
        <p className="mc-quiet">
          <b>No supplier price moved.</b> Your plate costs ended {said} exactly
          where they started it. That is worth knowing, and it is not the same
          as a month you have not entered — every rate on the book was already
          current.
        </p>
      </section>
    );
  }

  if (
    month.percent === null ||
    month.costThen === null ||
    month.costNow === null
  ) {
    return (
      <section className="card mc">
        <p className="mc-label">
          {said}, against {against}
        </p>
        {/*
          * A rate moved and the menu did not, which has two quite different
          * causes. Naming the wrong one is worse than saying nothing: this
          * used to read "no dish was costable at both ends of the month" on a
          * book where every ingredient had a rate and every dish costed
          * perfectly well. What had actually happened was that salt went up
          * 26 fils a kilo and the dishes use 16 g of it.
          */}
        <p className="mc-quiet">
          {month.frozenByLineRates > 0 ? (
            <>
              <b>
                {month.frozenByLineRates === 1
                  ? "One rate moved on the shelf and reached no dish."
                  : `${String(month.frozenByLineRates)} rates moved on the shelf and reached no dish.`}
              </b>{" "}
              Every line using{" "}
              {month.frozenByLineRates === 1 ? "it" : "them"} carries a rate
              somebody typed on the line, so the dish prices off that rather
              than off the shelf. That is what honouring an imported sheet
              means, and it also means those lines will not follow a supplier
              until somebody clears the typed rate.
            </>
          ) : month.impact.moved.length === 0 ? (
            <>
              <b>
                {month.rateMoves === 1
                  ? "One rate moved"
                  : `${String(month.rateMoves)} rates moved`}
                , and no plate moved with it.
              </b>{" "}
              The amounts are small enough in your dishes that not one of them
              changed by as much as a whole unit of money. Worth knowing before
              you take a supplier&rsquo;s call about it.
            </>
          ) : (
            <>
              {month.rateMoves === 1
                ? "One rate moved"
                : `${String(month.rateMoves)} rates moved`}{" "}
              in {said}, and no dish it reaches has every rate on file, so there
              is nothing to compare yet. Fill those in and this starts
              answering.
            </>
          )}
        </p>
      </section>
    );
  }

  const up = month.percent > 0;
  const flat = Math.abs(month.percent) < 0.05;
  const worst = month.impact.moved[0];

  return (
    <section className="card mc">
      <p className="mc-label">
        {said}, against {against}
      </p>

      <p
        className={`mc-figure display ${flat ? "is-flat" : up ? "is-up" : "is-down"}`}
      >
        {flat
          ? "Held"
          : `${up ? "+" : "−"}${Math.abs(month.percent).toFixed(1)}%`}
      </p>

      <p className="mc-said">
        {flat ? (
          <>
            Your plate costs ended {said} where they started, across{" "}
            {month.rateMoves === 1
              ? "one rate that moved"
              : `${String(month.rateMoves)} rates that moved`}
            . Some went up and some came down.
          </>
        ) : (
          <>
            The same plates cost <b>{m.withSymbol(month.costNow)}</b> to make at
            the end of {said}, against <b>{m.withSymbol(month.costThen)}</b> at
            the end of {against}.{" "}
            {month.dearer > 0 && (
              <>
                <b className="figure">{month.dearer}</b>{" "}
                {month.dearer === 1 ? "dish got dearer" : "dishes got dearer"}
              </>
            )}
            {month.dearer > 0 && month.cheaper > 0 && ", "}
            {month.cheaper > 0 && (
              <>
                <b className="figure">{month.cheaper}</b>{" "}
                {month.cheaper === 1 ? "got cheaper" : "got cheaper"}
              </>
            )}
            .
          </>
        )}
      </p>

      {month.impact.crossCount > 0 && (
        <p className="mc-cross">
          <b className="figure">{month.impact.crossCount}</b>{" "}
          {month.impact.crossCount === 1
            ? "dish is now over its target"
            : "dishes are now over their target"}{" "}
          that were not at the start of the month.{" "}
          <Link className="link" href="/recipes">
            See which
          </Link>
          .
        </p>
      )}

      {worst !== undefined &&
        worst.oldCost !== null &&
        worst.newCost !== null && (
          <p className="mc-worst">
            Most moved: <b>{worst.name}</b>, {m.withSymbol(worst.oldCost)} to{" "}
            {m.withSymbol(worst.newCost)} a plate
            {worst.via === null ? "" : `, through your ${worst.via}`}.
          </p>
        )}

      {/* What this cannot know, said once and plainly. */}
      <p className="mc-caveat">
        Measured on your dishes as they stand today, at each month&rsquo;s
        rates. It answers what your suppliers did, not what you changed on the
        recipes.
      </p>
    </section>
  );
}

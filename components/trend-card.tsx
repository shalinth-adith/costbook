"use client";

import { periodSaid } from "@/lib/engineering";
import type { Trend } from "@/lib/trend";

import { useMoney } from "./currency-provider";

/**
 * Six months of plate cost, as bars.
 *
 * The month card says one month against the one before. This shows the shape
 * of the half-year the same way, so a kitchen can see a rise that crept in over
 * three months rather than the one step that happened to land last month.
 *
 * The bars are pictures, so they may be warm; the figures under them are
 * figures, so they stay ink. A flat run is said as "held" rather than drawn as
 * six identical bars pretending to be a chart.
 */
export function TrendCard({ trend }: { trend: Trend }) {
  const m = useMoney();
  if (trend.dishes === 0 || trend.months.length === 0) return null;

  const max = Math.max(...trend.months.map((t) => t.total));
  const min = Math.min(...trend.months.map((t) => t.total));
  const first = trend.months[0];
  const last = trend.months[trend.months.length - 1];
  if (first === undefined || last === undefined) return null;

  /*
   * What the figure actually is, said on the card.
   *
   * It is one plate of each dish, added together — not the cost of a plate,
   * and not the cost of a month's cooking. The card printed it bare six
   * times and the owner's question was the right one: "15.94, 15.94, 15.94 —
   * what does that mean?" A figure nobody can name is not a figure.
   */
  const together = `one plate of each of ${String(trend.dishes)} ${
    trend.dishes === 1 ? "dish" : "dishes"
  }, added together`;

  /*
   * Nothing has moved, so there is nothing to show.
   *
   * This used to draw six identical bars, then — after the owner asked what
   * they meant — sixty-five words explaining that they meant nothing yet.
   * Both were wrong. A book where no rate has ever been changed has no
   * half-year to chart, and the dashboard already says "no supplier price
   * moved" under What changed lately. The card appears the day a rate moves,
   * which is the day it has something to say.
   */
  if (trend.moved === 0) return null;

  return (
    <section className="tr">
      <div className="tr-head">
        <p className="mc-label">
          {periodSaid(first.period)} to {periodSaid(last.period)}
        </p>
        <p className="mline">
          <b>
            {trend.percent === null
              ? "Plate costs held"
              : `Plate costs ${trend.percent > 0 ? "up" : "down"} ${Math.abs(trend.percent).toFixed(1)}%`}
          </b>
          <span className="mline-said">
            {together}, at each month&rsquo;s rates
          </span>
        </p>
      </div>

      <ol className="tr-bars" aria-label="Total plate cost by month">
        {trend.months.map((t, i) => {
          // Scaled between the six months' own low and high so a small move is
          // visible, with a floor so a flat run still draws a bar rather than a line.
          const span = max - min;
          // Of the ~80px left under the figure and above the month label.
          const h = span === 0 ? 46 : 22 + ((t.total - min) / span) * 56;
          const isLast = t.period === last.period;
          return (
            <li
              key={t.period}
              className={`tr-bar${isLast ? " is-now" : ""}`}
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="tr-fig figure">{m.money(t.total)}</span>
              <span
                className="tr-col"
                style={{ blockSize: `${String(h)}px` }}
                aria-hidden="true"
              />
              <span className="tr-mon">{periodSaid(t.period).slice(0, 3)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

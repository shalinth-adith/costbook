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
            over {trend.dishes} {trend.dishes === 1 ? "dish" : "dishes"}{" "}
            costable all six months
          </span>
        </p>
      </div>

      <ol className="tr-bars" aria-label="Total plate cost by month">
        {trend.months.map((t) => {
          // Scaled between the six months' own low and high so a small move is
          // visible, with a floor so a flat run still draws a bar rather than a line.
          const span = max - min;
          // Of the ~80px left under the figure and above the month label.
          const h = span === 0 ? 46 : 22 + ((t.total - min) / span) * 56;
          const isLast = t.period === last.period;
          return (
            <li key={t.period} className={`tr-bar${isLast ? " is-now" : ""}`}>
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

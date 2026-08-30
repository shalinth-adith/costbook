'use client';

import { formatMoney } from '@/core/currency';

import type { Impact, Movement } from '@/lib/impact';

/**
 * The list of what moved (A24, A25, A27).
 *
 * Two groups, not a sort toggle: crossers first, then everything else by size
 * of movement. There is no alphabetical option — a list of eleven dishes sorted
 * by name is a list you have to read, and the point is that you don't.
 *
 * Only the crossing rows take a tinted surface. A panel of red gets closed and
 * never opened again, and the product's whole value is that it gets opened.
 */
export function ImpactTable({
  impact,
  currencyCode,
  limit,
}: {
  impact: Impact;
  currencyCode: string;
  /** Show only the biggest N. The rest are counted, never silently dropped. */
  limit?: number | undefined;
}) {
  const money = (n: number | null) => (n === null ? '—' : formatMoney(n, currencyCode));

  const shown = limit === undefined ? impact.moved : impact.moved.slice(0, limit);
  const hidden = impact.moved.length - shown.length;

  const row = (m: Movement) => (
    <tr key={m.id} className="imp-row" data-crosses={m.crosses}>
      <td>
        <span className="imp-name">{m.name}</span>
        {/* The hook and the words sit under the name, so it reads as a
            sentence: "Vada Curry, via Chicken Kuruma". */}
        {m.via !== null && <span className="imp-via">↳ via {m.via}</span>}
        {m.crosses && <span className="imp-mark">NEWLY OVER</span>}
      </td>
      <td className="figure imp-pair">
        <span className="imp-was">{money(m.oldCost)}</span>
        <span aria-hidden="true">→</span>
        <span>{money(m.newCost)}</span>
      </td>
      <td className="figure imp-pair">
        <span className="imp-was">
          {m.oldFoodCost === null ? '—' : `${m.oldFoodCost.toFixed(1)}%`}
        </span>
        <span aria-hidden="true">→</span>
        <span>{m.newFoodCost === null ? '—' : `${m.newFoodCost.toFixed(1)}%`}</span>
      </td>
      <td className="figure imp-move">
        {m.foodCostDelta === null
          ? '—'
          : `${m.foodCostDelta > 0 ? '↑' : '↓'} ${Math.abs(m.foodCostDelta).toFixed(1)}`}
      </td>
    </tr>
  );

  return (
    <>
      <table className="imp-table">
        <thead>
          <tr>
            <th>Dish</th>
            <th>Cost a portion</th>
            <th>Share of its price</th>
            <th>Move</th>
          </tr>
        </thead>
        {impact.crossing.length > 0 && (
          <tbody>
            <tr className="imp-group">
              <td colSpan={4}>
                CROSSING YOUR TARGET — {impact.crossCount}
                <em>these are the ones to look at</em>
              </td>
            </tr>
            {shown.filter((m) => m.crosses).map(row)}
          </tbody>
        )}
        {shown.some((m) => !m.crosses) && (
          <tbody>
            <tr className="imp-group">
              <td colSpan={4}>
                MOVING, NOT CROSSING
                <em>biggest first — the rest can be ignored</em>
              </td>
            </tr>
            {shown.filter((m) => !m.crosses).map(row)}
          </tbody>
        )}
      </table>
      {/* Never a silent cap: what was left out is counted. */}
      {hidden > 0 && (
        <p className="imp-more figure">
          {shown.length} of {impact.moved.length} shown, worst first. {hidden} more moved by less.
        </p>
      )}
    </>
  );
}

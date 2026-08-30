'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  BAR_WIDTH,
  type Dashboard,
  type DashboardFilter,
  type DashboardRow,
  applyFilter,
  categoriesOf,
} from '@/lib/dashboard';
import { ORG } from '@/lib/data';
import { DASH, percent, points } from '@/lib/format';

import { useMoney } from './currency-provider';
import { StatusChip } from './status-chip';

/** Status is a word plus a shape, so a greyscale printout loses nothing. */
function Glyph({ row }: { row: DashboardRow }) {
  switch (row.status) {
    case 'over':
      return <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" /></svg>;
    case 'near':
      return <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.2 10.8 6 6 10.8 1.2 6Z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
    case 'on':
      return <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="5" width="10" height="2" fill="currentColor" /></svg>;
    case 'incomplete':
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="1.3" y="1.3" width="9.4" height="9.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M1.3 10.7 10.7 1.3" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
  }
}

export function DashboardView({ data, target }: { data: Dashboard; target: number }) {
  // Nothing costed yet. The dashboard's whole argument is its sort order, and
  // there is nothing to sort — so it says what would fill it instead. Written
  // in the same classes as every other empty state in the app.
  if (data.rows.length === 0) {
    return (
      <div className="card empty">
        <p className="empty-title">Nothing costed yet</p>
        <p className="empty-copy">
          This is where every dish lands once it has a cost, worst food cost first, read against
          your target. If you keep your recipes in a spreadsheet — and almost everyone does —
          importing it takes about a minute and fills this page. Costbook only reads your file.
        </p>
        <div className="empty-actions">
          <Link href="/import" className="btn btn-primary">Import your spreadsheet</Link>
          <Link href="/recipes" className="btn">Cost one dish by hand</Link>
        </div>
      </div>
    );
  }
  const [filter, setFilter] = useState<DashboardFilter>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');

  const categories = useMemo(() => categoriesOf(data.rows), [data.rows]);
  const rows = useMemo(
    () => applyFilter(data.rows, filter, query, category),
    [data.rows, filter, query, category],
  );

  const s = data.stats;
  const m = useMoney();

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1 className="page-title">Menu food cost</h1>
          <p className="page-sub">
            Costed from the rates you entered. Target food cost{' '}
            <span className="figure strong">{percent(target, 1)}</span>.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn">Export</button>
          <button type="button" className="btn btn-primary">
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M10 13.2V3.4m0 0L6.4 7M10 3.4 13.6 7M3.4 12.6v3a1.4 1.4 0 0 0 1.4 1.4h10.4a1.4 1.4 0 0 0 1.4-1.4v-3" />
            </svg>
            Import sheet
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="label">Dishes costed</span>
          <span className="figure stat-figure">{s.costed}</span>
        </div>
        <div className="stat">
          <span className="label">Over target</span>
          <span className="stat-row">
            <svg width="12" height="12" viewBox="0 0 12 12" className="ink-over" aria-hidden="true"><path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" /></svg>
            <span className="figure stat-figure ink-over">{s.over}</span>
            <span className="stat-note">of {s.costed}</span>
          </span>
        </div>
        <div className="stat">
          <span className="label">Average food cost</span>
          <span className="stat-row">
            <span className="figure stat-figure">{s.averageFoodCost === null ? DASH : percent(s.averageFoodCost)}</span>
            <span className="stat-note">not adjusted for how much each dish sells</span>
          </span>
        </div>
        <div className="stat">
          <span className="label">Not yet costed</span>
          <span className="stat-row">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1.3" y="1.3" width="9.4" height="9.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M1.3 10.7 10.7 1.3" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span className="figure stat-figure">
              {s.missingRate + s.notPlated + s.missingPrice}
            </span>
            <span className="stat-note">
              {s.missingRate} missing a rate, {s.notPlated} made by the batch,{' '}
              {s.missingPrice} without a price
            </span>
          </span>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-field toolbar-search">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="5.4" />
            <path d="m13.2 13.2 3.2 3.2" />
          </svg>
          <input
            value={query}
            placeholder={`Search ${data.rows.length} dishes`}
            aria-label="Search dishes"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="segmented segmented-sm" role="group" aria-label="Filter dishes">
          {([['all', 'All'], ['over', 'Over target'], ['incomplete', 'Not costed']] as const).map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                className={`segmented-item${filter === value ? ' is-active' : ''}`}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ),
          )}
        </div>

        <label className="category-select">
          <span className="visually-hidden">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">Category: all</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>

        <span className="toolbar-note">Sorted by food cost, worst first</span>
      </div>

      <div className="card dash-table">
        <div className="dash-head">
          <span />
          <span>Dish</span>
          <span>Category</span>
          <span className="end">Cost / portion</span>
          <span className="end">Menu price</span>
          <span className="end">Food cost</span>
          <span className="bar-head">Against target {percent(target, 1)}</span>
          <span className="end">Status</span>
        </div>

        {rows.map((row) => (
          <Link
            key={row.id}
            href={`/recipes/${row.id}`}
            className={`dash-row${row.status === 'over' ? ' is-over' : ''}${row.gap !== 'none' ? ' is-gap' : ''}`}
          >
            <span className={`dash-glyph ink-${row.status}`}><Glyph row={row} /></span>

            <span className="dash-name">
              <span className="dash-name-text">{row.name}</span>
              {row.nestedCount > 0 ? (
                <span className="figure dash-sub">SUB ×{row.nestedCount}</span>
              ) : null}
            </span>

            <span className="dash-cat">{row.category}</span>

            <span className={`figure end dash-cost${row.costPerPortion === null ? ' is-absent' : ''}`}>
              {m.money(row.costPerPortion)}
            </span>
            <span className="figure end dash-price">{m.money(row.sellingPrice)}</span>
            <span className={`figure end dash-fc ink-${row.status}`}>
              {percent(row.foodCostPercent)}
            </span>

            <span className="bar-cell">
              <span className="bar" style={{ width: `${BAR_WIDTH}px` }}>
                <span className="bar-target" style={{ insetInlineStart: `${data.targetPx}px` }} />
                <span className="bar-base" style={{ width: `${row.barBase}px` }} />
                {row.barOver > 0 ? (
                  <span
                    className={`bar-over is-${row.status}`}
                    style={{ width: `${row.barOver}px` }}
                  />
                ) : null}
              </span>
            </span>

            <span className="dash-status">
              {row.delta !== null ? (
                <span className={`figure delta delta-${row.status}`}>{points(row.delta)} pts</span>
              ) : (
                <span className="chip chip-incomplete delta-gap">
                  {row.gap === 'no_rate'
                    ? 'NO RATE'
                    : row.gap === 'no_portions'
                      ? 'BY THE BATCH'
                      : 'NO PRICE'}
                </span>
              )}
            </span>
          </Link>
        ))}

        <div className="dash-foot">
          <span>
            {s.missingRate > 0 ? (
              <>
                {s.missingRate} {s.missingRate === 1 ? 'dish is' : 'dishes are'} missing an
                ingredient rate, so {s.missingRate === 1 ? 'it has' : 'they have'} no cost yet. Fix
                the rates and they join the list.
              </>
            ) : (
              'Every dish has a cost.'
            )}
            {s.notPlated > 0 ? (
              <> {s.notPlated} more {s.notPlated === 1 ? 'is' : 'are'} made by the batch and used
              inside other dishes, so {s.notPlated === 1 ? 'it has' : 'they have'} no cost per
              portion.</>
            ) : null}
            {s.missingPrice > 0 ? (
              <> {s.missingPrice} {s.missingPrice === 1 ? 'is' : 'are'} costed but not priced.</>
            ) : null}
          </span>
          <span className="figure dash-count">{rows.length} of {data.rows.length}</span>
        </div>
      </div>
    </>
  );
}

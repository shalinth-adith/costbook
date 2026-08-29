'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import type { Pantry } from '@/core/recipe';

import {
  type Library,
  type LibraryFilter,
  type LibraryRow,
  applyLibraryFilter,
  describeMatch,
  groupByCategory,
  search,
} from '@/lib/library';
import { DASH, percent } from '@/lib/format';

import { useMoney } from './currency-provider';
import { StatusChip } from './status-chip';
import { NewDishSheet } from './sheets/new-dish-sheet';
import { Toast, type ToastState } from './toast';

const FILTERS: readonly { readonly value: LibraryFilter; readonly label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'on_menu', label: 'On the menu' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'over', label: 'Over target' },
  { value: 'archived', label: 'Archived' },
];

export function LibraryView({
  data,
  pantry,
  target,
  onDuplicate,
  onArchive,
  onCreate,
}: {
  data: Library;
  pantry: Pantry;
  target: number;
  onDuplicate: (id: string) => Promise<{ message: string; undoable: boolean }>;
  onArchive: (id: string, archived: boolean) => Promise<{ message: string; undoable: boolean }>;
  onCreate: (dish: { name: string; category: string; portions: number }) => Promise<{
    message: string;
    undoable: boolean;
    id: string | null;
  }>;
}) {
  const m = useMoney();
  const [tab, setTab] = useState<'dishes' | 'batches'>('dishes');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();

  const source = tab === 'dishes' ? data.dishes : data.batches;

  const outcome = useMemo(
    () => search(applyLibraryFilter(source, filter), query, pantry),
    [source, filter, query, pantry],
  );
  const groups = useMemo(() => groupByCategory(outcome.rows), [outcome.rows]);

  const act = (run: () => Promise<{ message: string; undoable: boolean }>) => {
    start(async () => setToast(await run()));
  };

  const toggle = (category: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1 className="page-title">Recipes</h1>
          <p className="page-sub">
            <span className="figure ink">{data.dishCount}</span> dishes and{' '}
            <span className="figure ink">{data.batchCount}</span> batches — everything you have a
            recipe for, on the menu or not.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M6 2v8M2 6h8" />
            </svg>
            New dish
          </button>
        </div>
      </div>

      <div className="toolbar library-toolbar">
        <div className="segmented segmented-sm" role="group" aria-label="What to list">
          <button
            type="button"
            className={`segmented-item${tab === 'dishes' ? ' is-active' : ''}`}
            aria-pressed={tab === 'dishes'}
            onClick={() => setTab('dishes')}
          >
            Dishes <span className="figure">{data.dishCount}</span>
          </button>
          <button
            type="button"
            className={`segmented-item${tab === 'batches' ? ' is-active' : ''}`}
            aria-pressed={tab === 'batches'}
            onClick={() => setTab('batches')}
          >
            Sub-recipes and batches <span className="figure">{data.batchCount}</span>
          </button>
        </div>

        <div className="search-field toolbar-search">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="5.4" />
            <path d="m13.2 13.2 3.2 3.2" />
          </svg>
          <input
            value={query}
            placeholder="Search a dish, or an ingredient in one"
            aria-label="Search recipes"
            onChange={(e) => setQuery(e.target.value)}
          />
          {query === '' ? null : (
            <button type="button" className="link link-sm" onClick={() => setQuery('')}>Clear</button>
          )}
        </div>

        <div className="chips" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`filter-chip${filter === f.value ? ' is-on' : ''}`}
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span className="toolbar-note">
          <span className="figure">{outcome.rows.length}</span> shown
        </span>
      </div>

      {/* Why each row is here. A dish surfacing because of an ingredient three
          levels down is otherwise a mystery. */}
      {query !== '' && outcome.rows.length > 0 ? (
        <p className="match-note">
          <strong>{describeMatch(outcome, tab === 'dishes' ? 'dish' : 'batch')}</strong>
          {outcome.byIngredient > 0 ? '. The matched ingredient is named on the row.' : '.'}
        </p>
      ) : null}

      {outcome.rows.length === 0 ? (
        <Empty
          query={query}
          filter={filter}
          target={target}
          onClear={() => { setQuery(''); setFilter('all'); }}
          onCreate={() => setCreating(true)}
        />
      ) : (
        <div className="library">
          {groups.map((group) => {
            const open = !collapsed.has(group.category);
            return (
              <section key={group.category} className="lib-group">
                <button
                  type="button"
                  className="lib-group-head"
                  aria-expanded={open}
                  onClick={() => toggle(group.category)}
                >
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                    strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"
                    className={open ? '' : 'is-closed'}>
                    <path d="m3 4.6 3 3 3-3" />
                  </svg>
                  <span className="lib-group-name">{group.category}</span>
                  <span className="figure lib-group-count">{group.rows.length}</span>
                </button>

                {open ? (
                  <div className={tab === 'dishes' ? 'lib-table' : 'lib-table is-batches'}>
                    <div className="lib-head">
                      <span>{tab === 'dishes' ? 'Dish' : 'Batch'}</span>
                      <span className="end">Components</span>
                      <span className="end">{tab === 'dishes' ? 'Cost / portion' : 'Cost per unit made'}</span>
                      {tab === 'dishes' ? <span className="end">Menu price</span> : null}
                      {tab === 'dishes' ? <span className="end">Food cost</span> : <span className="end">Used in</span>}
                      {tab === 'dishes' ? <span>Status</span> : null}
                      <span>Updated</span>
                      <span />
                    </div>

                    {group.rows.map((row) => (
                      <Row
                        key={row.id}
                        row={row}
                        isDish={tab === 'dishes'}
                        money={m}
                        busy={pending}
                        onDuplicate={() => act(() => onDuplicate(row.id))}
                        onArchive={() => act(() => onArchive(row.id, !row.archived))}
                      />
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <NewDishSheet
        open={creating}
        onClose={() => setCreating(false)}
        busy={pending}
        onCreate={(dish) =>
          start(async () => {
            const ack = await onCreate(dish);
            setCreating(false);
            setToast(ack);
          })
        }
      />

      <Toast toast={toast} onUndo={() => setToast(null)} onDismiss={() => setToast(null)} />
    </>
  );
}

function Row({
  row,
  isDish,
  money,
  busy,
  onDuplicate,
  onArchive,
}: {
  row: LibraryRow;
  isDish: boolean;
  money: ReturnType<typeof useMoney>;
  busy: boolean;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  return (
    <div className={`lib-row${row.archived ? ' is-archived' : ''}`}>
      <span className="lib-name">
        {isDish ? null : <span className="figure sub-badge">SUB</span>}
        <span className="lib-name-text">
          <Link href={`/recipes/${row.id}`} className="lib-link">{row.name}</Link>
          <span className="lib-note">
            {row.matchedOn === null ? row.note : `contains ${row.matchedOn}`}
          </span>
        </span>
      </span>

      <span className="figure end lib-dim">{row.componentCount}</span>

      <span className="figure end">
        {isDish
          ? money.money(row.costPerPortion)
          : `${money.money(row.costPerUnit)} / ${row.outputUnit}`}
      </span>

      {isDish ? <span className="figure end lib-dim">{money.money(row.sellingPrice)}</span> : null}

      {isDish ? (
        <span className={`figure end ink-${row.status}`}>{percent(row.foodCostPercent)}</span>
      ) : (
        <span className="figure end lib-dim">
          {row.usedIn === 0 ? DASH : `${row.usedIn} ${row.usedIn === 1 ? 'dish' : 'dishes'}`}
        </span>
      )}

      {isDish ? (
        <span className="lib-status">
          {row.archived ? (
            <span className="chip chip-incomplete">ARCHIVED</span>
          ) : !row.complete ? (
            <span className="lib-incomplete">
              <StatusChip status="incomplete" label="INCOMPLETE" />
              <span className="lib-floor">cost is a floor</span>
            </span>
          ) : null}
        </span>
      ) : null}

      <span className="lib-dim lib-updated">{row.updatedAt ?? DASH}</span>

      {/* Both actions stay visible. A kitchen with six biryanis builds five of
          them by duplicating the first, and an action that only exists under a
          mouse pointer does not exist on the tablet this ships to (A16). */}
      <span className="lib-actions">
        <button type="button" className="btn-row" disabled={busy} onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="btn-row" disabled={busy} onClick={onArchive}>
          {row.archived ? 'Restore' : 'Archive'}
        </button>
      </span>
    </div>
  );
}

/**
 * Three empty states, and they are not the same thing. An empty result is only
 * a failure when the operator was looking for something (A17).
 */
function Empty({
  query,
  filter,
  target,
  onClear,
  onCreate,
}: {
  query: string;
  filter: LibraryFilter;
  target: number;
  onClear: () => void;
  onCreate: () => void;
}) {
  if (query !== '') {
    return (
      <div className="card empty">
        <p className="empty-title">Nothing matches “{query}”</p>
        <p className="empty-copy">
          Not in a dish name, not in a batch, and not in any ingredient on any recipe. Check the
          spelling, or start it as a new dish and it will be here next time.
        </p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary" onClick={onCreate}>Create “{query}”</button>
          <button type="button" className="btn" onClick={onClear}>Clear the search</button>
        </div>
      </div>
    );
  }

  if (filter === 'over') {
    return (
      <div className="card empty">
        <p className="empty-title">Nothing is over your {percent(target, 1)} target</p>
        <p className="empty-copy">
          Every dish with a price on it is costing you less than you set out to spend. This filter
          will fill up on its own the next time a supplier rate moves — that is what it is for.
        </p>
        <div className="empty-actions">
          <button type="button" className="btn" onClick={onClear}>Show everything</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card empty">
      <p className="empty-title">No recipes yet</p>
      <p className="empty-copy">
        You almost certainly have this data already, in the sheet you keep your rates in. Bring
        that in and every dish on it arrives costed, categorised, and with its batches linked —
        which is a great deal faster than typing forty recipes by hand.
      </p>
      <div className="empty-actions">
        <Link href="/import" className="btn btn-primary">Import your sheet</Link>
      </div>
      <p className="empty-copy">
        Nothing to import yet? Add one dish by hand and the screen fills in from there.
      </p>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';

import type { Pantry } from '@/core/recipe';

import {
  type Library,
  type LibraryFilter,
  type LibraryRow,
  applyLibraryFilter,
  describeMatch,
  groupByCategory,
  worstFirst,
  search,
} from '@/lib/library';
import { DASH, percent, when } from '@/lib/format';

import { useMoney } from './currency-provider';
import { StatusChip } from './status-chip';
import { NewDishSheet } from './sheets/new-dish-sheet';
import { Toast, type ToastState } from './toast';
import { RecipesEmpty } from './recipes-empty';

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
  creating,
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
  /** Whether `?new=1` is on the URL. The sheet has no opinion of its own. */
  creating: boolean;
}) {
  const m = useMoney();
  const [tab, setTab] = useState<'dishes' | 'batches'>('dishes');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);
  /*
   * Whether the sheet is open is the URL's answer, not ours. `pushed` records
   * that we were the ones who put `?new=1` there, so closing can step back
   * over our own entry rather than stacking a second one that Back would
   * reopen. A sheet opened by a fresh load has nothing to step back to.
   */
  const router = useRouter();
  const pushed = useRef(false);
  const openCreate = () => {
    pushed.current = true;
    router.push('/recipes?new=1');
  };
  const closeCreate = () => {
    if (pushed.current) {
      pushed.current = false;
      router.back();
    } else {
      router.replace('/recipes');
    }
  };
  const [pending, start] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  /*
   * Shown only when the dates differ. Straight after an import all 79 dishes
   * carry the same timestamp, and a column of identical figures is a column
   * that costs width and gives nothing back.
   */
  const showUpdated = useMemo(() => {
    const dates = new Set(
      [...data.dishes, ...data.batches].map((r) => (r.updatedAt ?? '').slice(0, 10)),
    );
    return dates.size > 1;
  }, [data.dishes, data.batches]);

  const source = tab === 'dishes' ? data.dishes : data.batches;

  const outcome = useMemo(
    () => search(applyLibraryFilter(source, filter), query, pantry),
    [source, filter, query, pantry],
  );
  /*
   * How the list is ordered. Category is the default because the question this
   * screen answers most often is "where is that dish", and a menu is organised
   * the way the kitchen thinks of it.
   *
   * Worst-first is the other half of what the dashboard's table used to do,
   * and the only part of it worth keeping — the rest was five columns this
   * screen already had.
   */
  const [order, setOrder] = useState<'category' | 'worst'>('category');
  /*
   * Filters, closed.
   *
   * Every control that used to sit open on this toolbar answers an owner's
   * question — on the menu, over target, incomplete, archived — and this is
   * the screen the chef opens every shift to find the dish they are cooking.
   * FLOWS 1 names the two loops and this one was furnished entirely for the
   * wrong one: nine controls before a single dish.
   *
   * So the screen opens as search and the list. Nothing is removed; the
   * owner's questions are one press away, and the button says how many are
   * on so a filtered list is never mistaken for the whole book.
   */
  const [showFilters, setShowFilters] = useState(false);
  const groups = useMemo(
    () => (order === 'worst' ? worstFirst(outcome.rows) : groupByCategory(outcome.rows)),
    [outcome.rows, order],
  );

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


  const total = data.dishCount + data.batchCount;

  /*
   * Empty is not a list with nothing in it — it is a different screen (A35).
   * No toolbar for filtering nothing, no search for searching nothing, no tab
   * counts reading zero, and no second filled button proposing a slower
   * journey than the one beside it.
   */
  if (total === 0) return <RecipesEmpty />;

  /*
   * And one dish in is still nearly empty: a one-row table under a full filter
   * bar is the same mistake in miniature, so the toolbar waits until the list
   * earns it.
   */
  const bare = total <= 2;

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1 className="page-title">Recipes</h1>
          <p className="page-sub">
            {bare ? (
              <>
                <span className="figure ink">{data.dishCount}</span>{' '}
                {data.dishCount === 1 ? 'dish' : 'dishes'}, costed. Nothing else yet.
              </>
            ) : (
              <>
                <span className="figure ink">{data.dishCount}</span> dishes and{' '}
                <span className="figure ink">{data.batchCount}</span> batches — everything you have
                a recipe for, on the menu or not.
              </>
            )}
          </p>
        </div>
        <div className="page-actions">
          {/* A quieter control while the list is still one row: the import is
              the faster journey and should not be competing with a filled
              button beside it. */}
          {/* A link, not a sheet. Creating a dish is the work, not an
              interruption to it — see app/recipes/new/page.tsx. */}
          <Link
            href="/recipes/new"
            className={bare ? 'btn' : 'btn btn-primary'}
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M6 2v8M2 6h8" />
            </svg>
            {bare ? 'Add another' : 'New dish'}
          </Link>
        </div>
      </div>

      {bare ? null : (
      <div className="toolbar library-toolbar">
        {/* A tab offering an empty list is a control that can only disappoint.
            It comes back the moment the book has a batch in it. */}
        {data.batchCount > 0 && (
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
              Sub-recipes <span className="figure">{data.batchCount}</span>
            </button>
          </div>
        )}

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

        <button
          type="button"
          className={`filter-chip lib-more${showFilters ? ' is-on' : ''}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
        >
          <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M1.5 3h9M3 6h6M4.5 9h3" />
          </svg>
          Filter and sort
          {/* Named on the button, so a filtered list is never mistaken for the
              whole book once the panel is closed again. */}
          {filter !== 'all' && (
            <span className="lib-more-on">
              {FILTERS.find((f) => f.value === filter)?.label}
            </span>
          )}
          {order === 'worst' && <span className="lib-more-on">Worst first</span>}
        </button>

        <span className="toolbar-note">
          <span className="figure">{outcome.rows.length}</span> shown
        </span>
      </div>
      )}

      {!bare && showFilters && (
      <div className="toolbar lib-filters">
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

        <div className="segmented segmented-sm" role="group" aria-label="Order">
          <button
            type="button"
            className={`segmented-item${order === 'category' ? ' is-active' : ''}`}
            aria-pressed={order === 'category'}
            onClick={() => setOrder('category')}
          >
            By section
          </button>
          <button
            type="button"
            className={`segmented-item${order === 'worst' ? ' is-active' : ''}`}
            aria-pressed={order === 'worst'}
            onClick={() => setOrder('worst')}
          >
            Worst food cost
          </button>
        </div>
      </div>
      )}

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
          onCreate={openCreate}
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
                  <div className={tab === 'dishes' ? 'lib-table' : 'lib-table is-batches'} data-updated={showUpdated}>
                    <div className="lib-head">
                      <span>{tab === 'dishes' ? 'Dish' : 'Batch'}</span>
                      <span className="end">Components</span>
                      <span className="end">{tab === 'dishes' ? 'Cost / portion' : 'Cost per unit made'}</span>
                      {tab === 'dishes' ? <span className="end">Menu price</span> : null}
                      {tab === 'dishes' ? <span className="end">Food cost</span> : <span className="end">Used in</span>}
                      {tab === 'dishes' ? <span>Status</span> : null}
                      {/* A19's rule: a column where every row says the same
                          thing teaches nothing. Right after an import, every
                          dish carries the same timestamp. */}
                      {showUpdated ? <span>Updated</span> : null}
                      <span />
                    </div>

                    {group.rows.map((row) => (
                      <Row
                        showUpdated={showUpdated}
                        today={today}
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
        onClose={closeCreate}
        busy={pending}
        onCreate={(dish) =>
          start(async () => {
            const ack = await onCreate(dish);
            closeCreate();
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
  showUpdated,
  today,
  isDish,
  money,
  busy,
  onDuplicate,
  onArchive,
}: {
  showUpdated: boolean;
  today: string;
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

      {showUpdated ? <span className="lib-dim lib-updated">{when(row.updatedAt, today)}</span> : null}

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

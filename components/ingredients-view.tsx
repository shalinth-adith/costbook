'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';

import {
  type IngredientBoard,
  type IngredientFilter,
  type IngredientRow,
  applyIngredientFilter,
} from '@/lib/ingredients';
import { DASH, ago } from '@/lib/format';

import type { RatePreview } from '@/app/ingredients/actions';

import { useMoney } from './currency-provider';
import { ImpactPanel } from './impact-panel';
import { IngredientEntry, type NewIngredient } from './ingredient-entry';
import { Stepper } from './stepper';
import { Toast, type ToastState } from './toast';

interface Ack { readonly message: string; readonly undoable: boolean }

const FILTERS: readonly { value: IngredientFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'no_rate', label: 'No rate' },
  { value: 'stale', label: 'Stale' },
  { value: 'locked', label: 'Locked' },
];

export function IngredientsView({
  board,
  onAdd,
  onSetRate,
  onSetRates,
  onSetYield,
  onPreviewRate,
  currencyCode,
}: {
  board: IngredientBoard;
  onAdd: (i: NewIngredient) => Promise<Ack & { id: string | null }>;
  onSetRate: (id: string, packPrice: number) => Promise<Ack>;
  /** Costs the menu twice and reports what moved. Writes nothing (A24). */
  onPreviewRate: (id: string, packPrice: number) => Promise<RatePreview | null>;
  currencyCode: string;
  onSetRates: (changes: readonly { id: string; packPrice: number }[]) => Promise<Ack>;
  onSetYield: (id: string, yieldPercent: number) => Promise<Ack>;
}) {
  const m = useMoney();
  const [filter, setFilter] = useState<IngredientFilter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, start] = useTransition();

  /** Price update mode: every rate is a field, and nothing lands until commit. */
  const [bulk, setBulk] = useState(false);
  const [edits, setEdits] = useState<Readonly<Record<string, string>>>({});

  const rows = useMemo(
    () => applyIngredientFilter(board.rows, filter, query),
    [board.rows, filter, query],
  );

  /*
   * Two columns that earn their place or disappear (A19).
   *
   * A usable rate identical to the bought rate on every row is a column of
   * repeated figures; a status column where nothing has a status is a column of
   * blanks. Both are removed rather than shown empty.
   */
  const anyYield = useMemo(() => rows.some((r) => r.yieldPercent < 100), [rows]);
  const anyStatus = useMemo(() => rows.some((r) => r.status !== 'ok'), [rows]);

  const act = (run: () => Promise<Ack>) => start(async () => setToast(await run()));

  /*
   * A rate does not commit on its own. It opens the impact panel first, which
   * is the whole argument of the product: eleven dishes move and three cross
   * the target, and six of them never list this ingredient at all. Committing
   * silently would spend that moment on a toast.
   */
  const [pendingRate, setPendingRate] = useState<{ id: string; packPrice: number } | null>(null);
  const [preview, setPreview] = useState<RatePreview | null>(null);

  const proposeRate = (id: string, packPrice: number) => {
    setPendingRate({ id, packPrice });
    start(async () => setPreview(await onPreviewRate(id, packPrice)));
  };

  const applyPending = () => {
    const p = pendingRate;
    if (p === null) return;
    start(async () => {
      setToast(await onSetRate(p.id, p.packPrice));
      setPreview(null);
      setPendingRate(null);
    });
  };

  const keepOldRate = () => { setPreview(null); setPendingRate(null); };

  const changed = Object.entries(edits).filter(([id, value]) => {
    const row = board.rows.find((r) => r.id === id);
    if (row === undefined || value.trim() === '') return false;
    const entered = Number(value);
    return Number.isFinite(entered) && entered >= 0 && entered !== packPriceOf(row);
  });
  const changedLines = changed.reduce((n, [id]) => {
    return n + (board.rows.find((r) => r.id === id)?.usedIn ?? 0);
  }, 0);

  const commitBulk = () => {
    const list = changed.map(([id, value]) => ({ id, packPrice: Number(value) }));
    if (list.length === 0) return;
    start(async () => {
      setToast(await onSetRates(list));
      setEdits({});
      setBulk(false);
    });
  };

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1 className="page-title">Ingredients</h1>
          <p className="page-sub">
            One ingredient, entered once, priced once. Onion at{' '}
            <span className="figure ink">{m.withSymbol(42)} / kg</span> makes 500 g in any recipe
            cost <span className="figure ink">{m.withSymbol(21)}</span> — everywhere, until the
            price changes.
          </p>
        </div>
        <div className="page-actions">
          <Link href="/import" className="btn">Import a sheet</Link>
          <button
            type="button"
            className={`btn${bulk ? ' btn-primary' : ''}`}
            onClick={() => { setBulk(!bulk); setEdits({}); }}
          >
            Price update mode
          </button>
        </div>
      </div>

      <div className="toolbar library-toolbar">
        <div className="search-field toolbar-search">
          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <circle cx="9" cy="9" r="5.4" /><path d="m13.2 13.2 3.2 3.2" />
          </svg>
          <input
            value={query}
            placeholder="Search an ingredient or a supplier"
            aria-label="Search ingredients"
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
              {f.label} <span className="figure">{board.counts[f.value]}</span>
            </button>
          ))}
        </div>

        <span className="toolbar-note">
          Sorted by most recently priced · <span className="figure">{rows.length}</span> of{' '}
          <span className="figure">{board.counts.all}</span>
        </span>
      </div>

      <div className="ing-wrap">
        <IngredientEntry
          rows={board.rows}
          busy={pending}
          onAdd={(i) => start(async () => setToast(await onAdd(i)))}
          onOpenExisting={(id) => { setOpen(id); setQuery(''); }}
        />

        {bulk ? (
          <div className="bulk-bar">
            <span className="bulk-said">
              <strong>Price update mode.</strong> Every rate is a field. Nothing is applied until
              you press the button.
            </span>
            <span className="figure bulk-count">
              {changed.length} changed · {changedLines} recipe lines
            </span>
            <button type="button" className="btn" onClick={() => { setEdits({}); setBulk(false); }}>
              Discard
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={changed.length === 0 || pending}
              onClick={commitBulk}
            >
              Commit all changes
            </button>
          </div>
        ) : null}

        {rows.length === 0 ? (
          <div className="card empty">
            <p className="empty-title">
              {board.counts.all === 0 ? 'No ingredients yet' : 'Nothing here'}
            </p>
            <p className="empty-copy">
              {board.counts.all === 0
                ? 'The entry row above works and you can start typing into it. But if you keep a rate list in a spreadsheet — and almost everyone does — importing it takes a minute and gets you a hundred and forty ingredients instead of one.'
                : 'No ingredient matches that. If it is a filter rather than a search, that is usually the answer you wanted — nothing stale, nothing unpriced.'}
            </p>
          </div>
        ) : (
          <div className="card ing-table" data-cols={`${anyYield ? 'y' : ''}${anyStatus ? 's' : ''}`}>
            <div className="ing-head">
              <span>Ingredient</span>
              <span className="end">Rate</span>
              {/* A19: shown only where a yield is below 100%. A column of
                  figures identical to the one beside it teaches nothing. */}
              {anyYield ? <span className="end">Usable rate</span> : null}
              <span className="end">Used in</span>
              <span>Priced</span>
              {/* Collapses when nothing carries a status. */}
              {anyStatus ? <span>Status</span> : null}
              <span />
            </div>

            {rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                showYield={anyYield}
                showStatus={anyStatus}
                money={m}
                bulk={bulk}
                edit={edits[row.id] ?? ''}
                onEdit={(v) => setEdits((c) => ({ ...c, [row.id]: v }))}
                isOpen={open === row.id}
                busy={pending}
                onToggle={() => setOpen(open === row.id ? null : row.id)}
                onSetRate={(p) => proposeRate(row.id, p)}
                onSetYield={(y) => act(() => onSetYield(row.id, y))}
              />
            ))}
          </div>
        )}
      </div>

      <ImpactPanel
        preview={preview}
        currencyCode={currencyCode}
        busy={pending}
        onKeep={keepOldRate}
        onApply={applyPending}
      />

      <Toast toast={toast} onUndo={() => setToast(null)} onDismiss={() => setToast(null)} />
    </>
  );
}

/** The pack price behind a displayed rate, for comparing an edit against it. */
function packPriceOf(row: IngredientRow): number | null {
  return row.rate === null ? null : Number(row.rate.toFixed(4));
}

function Row({
  row,
  showYield,
  showStatus,
  money,
  bulk,
  edit,
  onEdit,
  isOpen,
  busy,
  onToggle,
  onSetRate,
  onSetYield,
}: {
  row: IngredientRow;
  showYield: boolean;
  showStatus: boolean;
  money: ReturnType<typeof useMoney>;
  bulk: boolean;
  edit: string;
  onEdit: (value: string) => void;
  isOpen: boolean;
  busy: boolean;
  onToggle: () => void;
  onSetRate: (packPrice: number) => void;
  onSetYield: (yieldPercent: number) => void;
}) {
  const m = useMoney();
  const [rateDraft, setRateDraft] = useState('');

  return (
    <div className={`ing-block${row.status === 'no_rate' ? ' is-missing' : ''}`}>
      <div className="ing-row">
        <span className="ing-name">
          <button type="button" className="ing-name-btn" onClick={onToggle} aria-expanded={isOpen}>
            {row.name}
          </button>
          <span className="ing-pack">
            {row.pack}
            {row.supplier === null ? '' : ` · ${row.supplier}`}
          </span>
        </span>

        <span className="figure end">
          {bulk ? (
            <input
              className="figure bulk-input"
              inputMode="decimal"
              value={edit}
              placeholder={row.rate === null ? '—' : money.money(row.rate)}
              aria-label={`Rate for ${row.name}`}
              onChange={(e) => onEdit(e.target.value)}
            />
          ) : row.rate === null ? (
            /* A dash, not 0.00. Zero is a figure and would make dishes look
               cheaper than they are; the absence of one is a different fact. */
            <span className="ing-absent">{DASH}</span>
          ) : (
            <button type="button" className="ing-rate" onClick={onToggle}>
              {money.money(row.rate)} <span className="ing-unit">/ {row.unit}</span>
            </button>
          )}
        </span>
        {showYield ? (
          <span className="figure end ing-dim">
            {row.usableRate === null
              ? DASH
              : `${money.money(row.usableRate)} / ${row.unit}`}
          </span>
        ) : null}

        <span className="figure end ing-dim">{row.usedIn}</span>
        <span className="ing-dim ing-when">{ago(row.ageDays)}</span>

        {showStatus ? (
          <span className="ing-status">
            {row.status === 'no_rate' ? (
              <span className="chip chip-over">NO RATE</span>
            ) : row.status === 'stale' ? (
              <span className="chip chip-near">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                  strokeWidth="1.5" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.6" /><path d="M6 3.4V6l1.8 1.2" />
                </svg>
                STALE
              </span>
            ) : row.status === 'locked' ? (
              <span className="chip chip-incomplete">LOCKED</span>
            ) : null}
          </span>
        ) : null}

        <span className="ing-more">
          <button
            type="button"
            className={`icon-btn${isOpen ? ' is-open' : ''}`}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${row.name}`}
            onClick={onToggle}
          >
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="m3 4.6 3 3 3-3" />
            </svg>
          </button>
        </span>
      </div>

      {isOpen ? (
        <div className="ing-detail">
          <div className="ing-detail-grid">
            <div>
              <div className="label">How much is left after peeling and trimming</div>
              <Stepper
                label={`yield for ${row.name}`}
                value={`${row.yieldPercent}%`}
                min={row.yieldPercent <= 5}
                disabled={busy}
                onDown={() => onSetYield(Math.max(5, row.yieldPercent - 1))}
                onUp={() => onSetYield(Math.min(100, row.yieldPercent + 1))}
              />
              <p className="ing-detail-copy">
                {row.rate === null ? (
                  'Give it a rate and the difference between bought and usable appears here.'
                ) : (
                  <>
                    <span className="figure">{money.withSymbol(row.rate)} / {row.unit}</span> bought
                    {' · '}
                    <span className="figure strong">
                      {money.withSymbol(row.usableRate)} / {row.unit}
                    </span>{' '}
                    usable
                  </>
                )}
              </p>
              <p className="ing-detail-copy">
                Left at 100% this field costs you nothing. Below it, the difference between bought
                and usable is the whole reason it exists.
              </p>
            </div>

            <div>
              <div className="label">Rate</div>
              {row.lockedBy === null ? (
                <div className="ing-rate-set">
                  <div className="money-field">
                    <span className="figure money-symbol">{money.symbol}</span>
                    <input
                      className="figure"
                      inputMode="decimal"
                      value={rateDraft}
                      placeholder={row.rate === null ? '0.00' : money.money(row.rate)}
                      aria-label={`New rate for ${row.name}`}
                      onChange={(e) => setRateDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        const v = Number(rateDraft);
                        if (Number.isFinite(v) && v >= 0) { onSetRate(v); setRateDraft(''); }
                      }}
                    />
                    <span className="figure money-symbol">/ {row.unit}</span>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    disabled={busy || rateDraft.trim() === ''}
                    onClick={() => {
                      const v = Number(rateDraft);
                      if (Number.isFinite(v) && v >= 0) { onSetRate(v); setRateDraft(''); }
                    }}
                  >
                    Set the rate
                  </button>
                </div>
              ) : (
                /* The value recedes because the operator did not set it. The
                   sentence saying who owns it does not recede at all (A20). */
                <p className="ing-detail-copy">
                  This rate comes from the <strong>{row.lockedBy}</strong> feed and updates itself.
                  You can override it, and the override holds until the next feed.
                </p>
              )}
              {row.status === 'stale' && row.ageDays !== null ? (
                <p className="ing-detail-copy warn-ink">
                  Last priced {Math.round(row.ageDays / 30)} months ago. The figure is not wrong on
                  the screen, it is wrong in the world.
                </p>
              ) : null}
            </div>

            <div>
              <div className="label">A rate change moves these</div>
              <p className="ing-detail-copy">
                {row.usedIn === 0 ? (
                  'Nothing uses this yet.'
                ) : (
                  <>
                    <strong>{row.usedIn} {row.usedIn === 1 ? 'recipe uses' : 'recipes use'}</strong>{' '}
                    this. Changing the rate reprices all of them at once.
                  </>
                )}
              </p>
              {/* Rate history (A28). Kept because "the price has always been
                  that" is a thing suppliers say, and without this the operator
                  has only their memory to answer it with. */}
              {row.history.length > 0 && (
                <div className="rate-history">
                  <span className="label">Rate history</span>
                  {row.history.map((h) => (
                    <span className="rate-history-row" key={`${h.on}-${h.to}`}>
                      <span>{h.on}</span>
                      <span className="figure">
                        {h.from === null ? 'first rate' : m.money(h.from)}
                        {h.from !== null && <span aria-hidden="true"> → </span>}
                        {h.from !== null && m.money(h.to)}
                        {h.from === null && ` ${m.money(h.to)}`}
                      </span>
                    </span>
                  ))}
                  <span className="rate-history-note">
                    Three changes on the free tier; every change on the paid one.
                  </span>
                </div>
              )}

              {row.usedIn === 0 ? null : (
                <Link href={`/recipes?q=${encodeURIComponent(row.name)}`} className="link link-sm">
                  See the recipes
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

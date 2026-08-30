'use client';

import { formatMoney } from '@/core/currency';

import type { RatePreview } from '@/app/ingredients/actions';

import { ImpactTable } from './impact-table';

/**
 * The rate-change impact panel (A24, A25).
 *
 * Opens over the ingredient list before anything is committed, sorted by
 * consequence. This is the moment the product justifies its price: six of
 * eleven dishes never list onion — they reach it through a gravy — and that is
 * the connection no spreadsheet makes and nobody holds in their head.
 *
 * The scrim is deliberately weak. The rate just typed is still visible behind
 * the panel, and checking it is the first thing anyone does.
 */
export function ImpactPanel({
  preview,
  currencyCode,
  busy,
  onKeep,
  onApply,
}: {
  preview: RatePreview | null;
  currencyCode: string;
  busy: boolean;
  onKeep: () => void;
  onApply: () => void;
}) {
  if (preview === null) return null;

  const money = (n: number | null) => (n === null ? 'no rate' : formatMoney(n, currencyCode));
  const nothing = preview.impact.moved.length === 0;

  return (
    <>
      <div className="imp-scrim" onClick={onKeep} aria-hidden="true" />
      <aside className="imp-panel" role="dialog" aria-modal="true" aria-label="Before this is applied">
        <header className="imp-panel-top">
          <span className="imp-kicker">Before this is applied</span>
          <h2>{preview.name} — new rate</h2>
          <div className="imp-rate">
            <span className="imp-rate-was">
              <em>Was</em>
              <b className="figure">{money(preview.from)}</b>
            </span>
            <span aria-hidden="true" className="imp-arrow">→</span>
            <span className="imp-rate-now">
              <em>Now</em>
              <b className="figure">{money(preview.to)}</b>
            </span>
            <span className="imp-rate-unit">a {preview.unit}</span>
            {preview.percent !== null && (
              <span className="imp-pct figure" data-up={preview.percent > 0}>
                {preview.percent > 0 ? '↑' : '↓'} {Math.abs(preview.percent).toFixed(0)}%
              </span>
            )}
          </div>
        </header>

        <div className="imp-panel-body">
          {/* "Nothing moves" is good news and reads as such. An empty panel with
              a bare "0 dishes affected" makes a fine outcome feel like a failed
              search. */}
          <p className="imp-headline" data-good={nothing}>{preview.headline}</p>

          {nothing ? (
            <div className="imp-none">
              <p>
                No recipe uses {preview.name} yet, so this rate touches nothing. We&rsquo;ll keep it
                on file and use it the first time you add the ingredient to a recipe.
              </p>
              <p className="set-note">
                You&rsquo;ll still see the change in this ingredient&rsquo;s rate history, which is
                where you look when a supplier tells you the price has always been that.
              </p>
            </div>
          ) : (
            <>
              <p className="imp-safe">
                Nothing is repriced yet. Your menu stays exactly as it is until you apply this, and
                you can undo it for seven days afterwards.
              </p>
              <ImpactTable impact={preview.impact} currencyCode={currencyCode} />
            </>
          )}
        </div>

        <footer className="imp-panel-foot">
          <span className="imp-foot-note">
            {nothing
              ? 'The rate is kept on file either way.'
              : `Applying this recosts every dish above. Nothing else changes.`}
          </span>
          <button type="button" className="btn" onClick={onKeep} disabled={busy}>
            Keep the old rate
          </button>
          <button type="button" className="btn btn-primary" onClick={onApply} disabled={busy}>
            {busy ? 'Applying…' : 'Apply the new rate'}
          </button>
        </footer>
      </aside>
    </>
  );
}

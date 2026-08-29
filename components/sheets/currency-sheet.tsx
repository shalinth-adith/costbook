'use client';

import { useMemo, useState } from 'react';

import {
  CURRENCIES,
  type Conversion,
  convert,
  currency as lookup,
  describeConversion,
  formatMoney,
} from '@/core/currency';

import { Sheet } from '../sheet';

/**
 * Moving the account to another currency.
 *
 * Two facts have to be true before this is safe. The operator supplies the
 * rate — Costbook never looks one up, for the same reason it ships no tax
 * rates: a figure we cannot stand behind should not be presented as one
 * (COSTING_MODELS 4.3). And the preview shows real figures from their own
 * menu, because "every rate converts" means nothing until you see what your
 * onion becomes.
 */
export interface CurrencyPreviewRow {
  readonly label: string;
  readonly amount: number;
  readonly per: string | null;
}

export function CurrencySheet({
  open,
  onClose,
  from,
  preview,
  busy,
  onSwitch,
}: {
  open: boolean;
  onClose: () => void;
  from: string;
  /** A few real figures from the operator's own menu. */
  preview: readonly CurrencyPreviewRow[];
  busy: boolean;
  onSwitch: (conversion: Conversion) => void;
}) {
  const [to, setTo] = useState('');
  const [rateText, setRateText] = useState('');

  const entered = Number(rateText);
  const rateOk = rateText.trim() !== '' && Number.isFinite(entered) && entered > 0;
  const chosen = to !== '' && to !== from;

  const conversion: Conversion | null = useMemo(
    () => (chosen && rateOk ? { from, to, rate: entered } : null),
    [chosen, rateOk, from, to, entered],
  );

  const fromCurrency = lookup(from);
  const toCurrency = to === '' ? null : lookup(to);

  return (
    <Sheet
      title="Change the currency"
      open={open}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={conversion === null || busy}
            onClick={() => { if (conversion !== null) onSwitch(conversion); }}
          >
            {busy
              ? 'Converting…'
              : toCurrency === null
                ? 'Pick a currency'
                : `Convert everything to ${toCurrency.code}`}
          </button>
        </>
      }
    >
      <p className="sheet-copy">
        Your prices are in <strong>{fromCurrency.name}</strong>. Moving to another currency
        converts every rate you have entered and every menu price — it does not just change the
        symbol, because rupee figures wearing a dirham sign would be wrong by a factor of twenty.
      </p>

      <label className="field">
        <span className="label">Move prices to</span>
        <select
          className="rule-select field-select"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        >
          <option value="">Choose a currency</option>
          {CURRENCIES.filter((c) => c.code !== from).map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </label>

      {toCurrency === null ? null : (
        <>
          <label className="field">
            <span className="label">
              What one {toCurrency.code} is worth in {fromCurrency.code}
            </span>
            <div className="money-field">
              <span className="figure money-symbol">1 {toCurrency.code} =</span>
              <input
                className="figure"
                inputMode="decimal"
                value={rateText}
                placeholder="0.00"
                aria-label={`Value of one ${toCurrency.code} in ${fromCurrency.code}`}
                onChange={(e) => setRateText(e.target.value)}
              />
              <span className="figure money-symbol">{fromCurrency.code}</span>
            </div>
            <span className="field-work">
              Costbook does not look this up. Use the figure your bank or your supplier is
              actually giving you.
            </span>
          </label>

          {conversion === null ? null : (
            <div className="live-note">
              <span className="label">What this does to your figures</span>
              <div className="figure live-sum">{describeConversion(conversion)}</div>

              <ul className="convert-preview">
                {preview.map((row) => (
                  <li key={row.label}>
                    <span className="convert-name">{row.label}</span>
                    <span className="figure convert-before">
                      {formatMoney(row.amount, from)}
                      {row.per === null ? '' : ` / ${row.per}`}
                    </span>
                    <span className="convert-arrow" aria-hidden="true">→</span>
                    <span className="figure convert-after">
                      {formatMoney(convert(row.amount, conversion), to)}
                      {row.per === null ? '' : ` / ${row.per}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="sheet-foot-note">
            Every ingredient rate, every rate typed on a line, every spend and every menu price
            converts. An ingredient with no rate still has none. The conversion and the figure you
            used are recorded, so any number can be traced back.
          </p>
        </>
      )}
    </Sheet>
  );
}

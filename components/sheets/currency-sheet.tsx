'use client';

import { CURRENCIES, currency as lookup, formatMoney } from '@/core/currency';

import { Sheet } from '../sheet';

/**
 * The currency the account prices in.
 *
 * Chosen once, at the start, and then left alone (TRD 4, PRD 5.1). The list is
 * always shown, because someone opening this wants to see what is on offer —
 * but once a dish exists it is a list to read rather than to pick from, and
 * the sheet says why in a sentence rather than by greying everything out.
 *
 * Changing currency on an account that already holds rates is not a label
 * change. Every one of those rates was typed in the currency in force at the
 * time, so relabelling would leave one currency's figures under another's
 * symbol. Doing it properly means converting each of them at a rate the
 * operator supplies, and that is a separate feature rather than a checkbox.
 */
export function CurrencySheet({
  open,
  onClose,
  current,
  settable,
  dishCount,
  busy,
  onChoose,
}: {
  open: boolean;
  onClose: () => void;
  current: string;
  /** False once anything has been priced in the current currency. */
  settable: boolean;
  dishCount: number;
  busy: boolean;
  onChoose: (code: string) => void;
}) {
  const c = lookup(current);

  return (
    <Sheet
      title={settable ? 'Choose your currency' : 'Your currency'}
      open={open}
      onClose={onClose}
      footer={<button type="button" className="btn wide" onClick={onClose}>Done</button>}
    >
      {settable ? (
        <p className="sheet-copy">
          Every rate and every price you enter will be in this currency. Pick it before you start
          costing — it is the one thing easier to set now than later.
        </p>
      ) : (
        <p className="sheet-copy">
          You are pricing in <strong>{c.name}</strong>, and{' '}
          <span className="figure">{dishCount}</span>{' '}
          {dishCount === 1 ? 'dish is' : 'dishes are'} costed in it. Every rate on them was typed
          in {c.code}, so changing the label here would leave those figures under the wrong
          symbol. Moving an account to another currency means converting each of them at a rate
          you give — that is coming, and it is not this.
        </p>
      )}

      <ul className="currency-list">
        {CURRENCIES.map((item) => {
          const chosen = item.code === c.code;
          return (
            <li key={item.code}>
              <button
                type="button"
                className={`currency-option${chosen ? ' is-chosen' : ''}`}
                aria-pressed={chosen}
                disabled={!settable || busy || chosen}
                onClick={() => onChoose(item.code)}
              >
                <span className="currency-mark" aria-hidden="true">
                  {chosen ? (
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2.4 6.2 4.8 8.6 9.6 3.6" />
                    </svg>
                  ) : null}
                </span>
                <span className="figure currency-code">{item.code}</span>
                <span className="currency-name">{item.name}</span>
                {/* The same figure, written the way each currency writes it —
                    which is the part a symbol alone does not tell you. */}
                <span className="figure currency-sample">{formatMoney(1234.5, item.code)}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="sheet-foot-note">
        {settable
          ? 'Costbook holds one currency per account and does not convert between them, so every figure you see is a figure you entered.'
          : 'Costbook holds one currency per account. Nothing here is converted, so every figure you see is a figure you entered.'}
      </p>
    </Sheet>
  );
}

'use client';

import { createContext, useContext, useMemo } from 'react';

import { type Currency, currency as lookup } from '@/core/currency';
import { money as formatAmount, rate as formatRateFigure } from '@/lib/format';

/**
 * The account's currency, available to anything that shows a figure.
 *
 * A context rather than a prop threaded through a dozen components, because
 * every one of them shows money and none of them decides which currency it is
 * in. There is exactly one per account (TRD 4), so there is nothing to choose
 * between at the point of use.
 */
const CurrencyContext = createContext<Currency>(lookup('INR'));

export function CurrencyProvider({
  code,
  children,
}: {
  code: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => lookup(code), [code]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export interface Money {
  readonly currency: Currency;
  /** The symbol alone, for the span that sits beside a figure. */
  readonly symbol: string;
  /** Whether the symbol goes before or after. */
  readonly position: Currency['position'];
  /** A figure with no symbol, so a column stays aligned on the decimal. */
  readonly money: (value: number | null | undefined, places?: number) => string;
  /** A rate, which runs to more places than money. */
  readonly rate: (value: number | null | undefined) => string;
  /** Symbol and figure together, for plain text with no markup to hang one on. */
  readonly withSymbol: (value: number | null | undefined) => string;
}

export function useMoney(): Money {
  const c = useContext(CurrencyContext);

  return useMemo(
    () => ({
      currency: c,
      symbol: c.symbol,
      position: c.position,
      money: (value, places) => formatAmount(value, c.code, places),
      rate: (value) => formatRateFigure(value, c.code),
      withSymbol: (value) => {
        const figure = formatAmount(value, c.code);
        return c.position === 'prefix' ? `${c.symbol} ${figure}` : `${figure} ${c.symbol}`;
      },
    }),
    [c],
  );
}

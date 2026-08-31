'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { currency } from '@/core/currency';

import { chooseCurrency } from '@/app/actions';

import { CurrencySheet } from './sheets/currency-sheet';
import { Toast, type ToastState } from './toast';

import { Wordmark } from './wordmark';

/**
 * Import is one of the five, per A16. A repeat import is a monthly rhythm once
 * a supplier's price list arrives (FLOWS 3.3), not a one-time onboarding step,
 * so it is somewhere an operator returns to.
 */
const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Recipes', href: '/recipes' },
  { label: 'Ingredients', href: '/ingredients' },
  { label: 'Import', href: '/import' },
  { label: 'Settings', href: '/settings' },
] as const;

/** The operator's initials, standing in for an account menu. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppShell({
  current,
  orgName,
  currencyCode,
  currencySettable,
  dishCount,
  children,
}: {
  current: string;
  /** The operator's own name for their place, as answered at setup. */
  orgName: string;
  currencyCode: string;
  /** False once anything has been priced, which settles the currency. */
  currencySettable: boolean;
  dishCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [pending, start] = useTransition();

  const c = currency(currencyCode);

  const run = (code: string) => {
    start(async () => {
      const ack = await chooseCurrency(code);
      setOpen(false);
      setToast(ack);
    });
  };

  return (
    <div className="shell">
      <header className="topbar">
        <Wordmark mode="app" />

        <nav className="nav" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="nav-item"
              aria-current={item.label === current ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-end">
          {/* The chip already says which currency this is, so it is also the
              way to change it. */}
          <button type="button" className="currency-chip" onClick={() => setOpen(true)}>
            {/* Several currencies use their code as their symbol — AED, SAR,
                OMR — so printing both renders "AED AED". The code is the
                label in that case. */}
            <span className="figure">{c.symbol === c.code ? c.code : `${c.symbol} ${c.code}`}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="m3 4.8 3 3 3-3" />
            </svg>
          </button>
          <span className="topbar-org">{orgName}</span>
          <span className="avatar" aria-hidden="true">{initialsOf(orgName)}</span>
        </div>
      </header>
      {children}

      <CurrencySheet
        open={open}
        onClose={() => setOpen(false)}
        current={c.code}
        settable={currencySettable}
        dishCount={dishCount}
        busy={pending}
        onChoose={run}
      />

      <Toast toast={toast} onUndo={() => setToast(null)} onDismiss={() => setToast(null)} />
    </div>
  );
}

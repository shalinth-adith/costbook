'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { currency } from '@/core/currency';

import { chooseCurrency } from '@/app/actions';

import { CurrencySheet } from './sheets/currency-sheet';
import { Toast, type ToastState } from './toast';

import { ORG } from '@/lib/data';

import { Mark } from './mark';

/**
 * Four, not five. A12's nav drops Import — bringing a sheet in is something an
 * operator does from the dashboard when a price list arrives, not a place they
 * live in.
 */
const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Recipes', href: '/recipes' },
  { label: 'Ingredients', href: '/ingredients' },
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
  currencyCode,
  currencySettable,
  dishCount,
  children,
}: {
  current: string;
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
        <Link href="/" className="brand">
          <Mark />
          <span>Costbook</span>
        </Link>

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
            <span className="figure">{c.symbol} {c.code}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="m3 4.8 3 3 3-3" />
            </svg>
          </button>
          <span className="topbar-org">{ORG.name}</span>
          <span className="avatar" aria-hidden="true">{initialsOf(ORG.name)}</span>
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

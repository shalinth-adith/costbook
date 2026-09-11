'use client';

import { signOut } from '@/app/sign-up/actions';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { currency } from '@/core/currency';
import { FREE_LIMITS, type Plan } from '@/lib/org';

import { chooseCurrency } from '@/app/actions';

import { CurrencySheet } from './sheets/currency-sheet';
import { Toast, type ToastState } from './toast';

import { Wordmark } from './wordmark';
import { AppFooter } from './app-footer';

/**
 * Import is one of the five, per A16. A repeat import is a monthly rhythm once
 * a supplier's price list arrives (FLOWS 3.3), not a one-time onboarding step,
 * so it is somewhere an operator returns to.
 */
/** One stroke icon a word, 24-grid, so the nav reads at a glance. */
const NAV_ICON: Readonly<Record<string, string>> = {
  Dashboard: 'M4 5h6v6H4zM14 5h6v4h-6zM14 13h6v6h-6zM4 15h6v4H4z',
  Recipes: 'M5 4h14v16H5zM8.5 9h7M8.5 13h5',
  Ingredients: 'M4 10h16l-1.5 9h-13zM8 10V7a4 4 0 018 0v3',
  Import: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  Settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5',
  More: 'M5 12h.01M12 12h.01M19 12h.01',
  Help: 'M12 17h.01M9.2 9a2.8 2.8 0 115.2 1.4c-.6 1-1.9 1.3-2.2 2.4M4 4h16v16H4z',
  Plan: 'M4 6h16v12H4zM4 10h16M8 14h4',
};

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Recipes', href: '/recipes' },
  { label: 'Ingredients', href: '/ingredients' },
  { label: 'Import', href: '/import' },
  { label: 'Settings', href: '/settings' },
] as const;

/**
 * The bottom bar, on a phone.
 *
 * Five items across the top of a 390px screen is 565px of nav, which is why
 * the whole application scrolled sideways on a phone. Three destinations and
 * a More, at the bottom where a thumb is — the two that are visited daily,
 * the one that is visited weekly, and everything else behind one press.
 *
 * Import is not on the bar. It is a monthly rhythm, not a daily one, and a
 * bar of four is the most a thumb reads at a glance.
 */
const TABS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Recipes', href: '/recipes' },
  { label: 'Ingredients', href: '/ingredients' },
] as const;

/** What More opens. Everything the bar could not hold, and the way out. */
const MORE = [
  { label: 'Import', href: '/import', said: 'Bring a supplier sheet in' },
  { label: 'Settings', href: '/settings', said: 'Your kitchen, and the rules you price by' },
  { label: 'Plan', href: '/plans', said: 'What you are on, and what it costs' },
  { label: 'Help', href: '/help', said: 'Ask us — the reply lands on that page' },
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
  plan,
  children,
}: {
  current: string;
  /** The operator's own name for their place, as answered at setup. */
  orgName: string;
  currencyCode: string;
  /** False once anything has been priced, which settles the currency. */
  currencySettable: boolean;
  dishCount: number;
  /** Free or paid. The trial counter is drawn only while there is a trial. */
  plan: Plan;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /** The phone's More sheet. Never opens on a laptop — the bar is hidden there. */
  const [more, setMore] = useState(false);
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

        <nav className="nav is-wide" aria-label="Main">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="nav-item"
              aria-current={item.label === current ? 'page' : undefined}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={NAV_ICON[item.label] ?? NAV_ICON.Dashboard} />
              </svg>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="topbar-end">
          {/*
            * How much of the trial is left, on every screen.
            *
            * "Six dishes, free" was said on the landing page, on the sign-in
            * screen and on the plans page — and nowhere at all inside the
            * product. Somebody who signed up learned the limit by reaching
            * it, which is the worst possible moment to hear about it.
            *
            * A counter and not a banner, deliberately. A banner is dismissed
            * and then gone; a figure sitting beside the name is a fact, and
            * at six it becomes the prompt without ever having been a nag.
            * Gone entirely once the book is paid for: there is nothing left
            * to count, and a spent meter is just a reminder of a wall.
            */}
          {plan === 'free' ? (
            <Link
              href="/plans"
              className="trial"
              data-full={dishCount >= FREE_LIMITS.recipes ? '' : undefined}
              title={
                dishCount >= FREE_LIMITS.recipes
                  ? 'The six free dishes are costed. See what a plan opens.'
                  : `${String(FREE_LIMITS.recipes - dishCount)} of your ${String(FREE_LIMITS.recipes)} free dishes left`
              }
            >
              <span className="trial-pips" aria-hidden="true">
                {Array.from({ length: FREE_LIMITS.recipes }, (_, i) => (
                  <span key={i} data-on={i < dishCount ? '' : undefined} />
                ))}
              </span>
              <span className="trial-said">
                <b className="figure">{Math.min(dishCount, FREE_LIMITS.recipes)}</b>
                {' of '}
                <b className="figure">{FREE_LIMITS.recipes}</b>
                {' costed'}
              </span>
            </Link>
          ) : null}
          {/*
            * Offered only while it can still be answered.
            *
            * The currency is set once and never changed — Costbook does not
            * convert, so moving it would leave every rate on file meaning
            * something else, and Settings says exactly that. A chevron beside
            * it on every screen of an account that has been costing for a year
            * is a control that cannot do anything, which is worse than no
            * control: it invites a click and then explains why not.
            */}
          {currencySettable ? (
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
          ) : null}
          {/*
            * The name opens the menu, and says so.
            *
            * The initials alone were the only handle, and a circle of letters
            * does not read as a control. The name beside it was a plain span
            * that did nothing when clicked — which is the worst arrangement of
            * the two, because the thing that looks clickable is not.
            */}
          <details className="acct">
            <summary className="acct-trigger" aria-label="Account menu">
              <span className="topbar-org">{orgName}</span>
              <span className="avatar" aria-hidden="true">{initialsOf(orgName)}</span>
              <svg className="acct-caret" width="11" height="11" viewBox="0 0 12 12" fill="none"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="m3 4.8 3 3 3-3" />
              </svg>
            </summary>
            <div className="acct-menu" role="menu">
              <span className="acct-org">{orgName}</span>
              <Link href="/settings" role="menuitem">Settings</Link>
              <Link href="/plans" role="menuitem">Your plan</Link>
              <form action={signOut}>
                <button type="submit" className="acct-out" role="menuitem">Sign out</button>
              </form>
            </div>
          </details>
        </div>
      </header>

      {/*
        * The page, framed.
        *
        * Content used to run to all four edges of the window and stop dead at
        * the bottom — the last line of the dashboard sat on the sill with
        * nothing under it, which reads as a page that was cut off rather than
        * one that ended. Full width on white still holds: the frame sits a few
        * pixels in from the glass and the ground outside it is the same white,
        * so nothing is narrowed. It only draws the edge that was implied.
        */}
      <div className="page">{children}</div>

      {/* Where the page ends, and where to find a person. */}
      <AppFooter />

      {/*
        * The bottom bar and its More sheet. Drawn always, shown only below
        * 700px: rendering it on a media query rather than on a width read in
        * JavaScript means it is correct in the first frame, with no flash of
        * the wrong shell and nothing to measure.
        */}
      <nav className="tabbar" aria-label="Main">
        {TABS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="tab"
            aria-current={item.label === current ? 'page' : undefined}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={NAV_ICON[item.label] ?? NAV_ICON.Dashboard} />
            </svg>
            <span>{item.label}</span>
          </Link>
        ))}
        <button
          type="button"
          className={`tab${more ? ' is-on' : ''}`}
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d={NAV_ICON.More ?? ''} />
          </svg>
          <span>More</span>
        </button>
      </nav>

      {more && (
        <div className="more-back" onClick={() => setMore(false)} aria-hidden="true" />
      )}
      <div className={`more-sheet${more ? ' is-open' : ''}`} hidden={!more}>
        <p className="more-who">{orgName}</p>
        {MORE.map((item) => (
          <Link key={item.label} href={item.href} className="more-item" onClick={() => setMore(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={NAV_ICON[item.label] ?? NAV_ICON.Settings} />
            </svg>
            <span className="more-said">
              <b>{item.label}</b>
              {item.said}
            </span>
          </Link>
        ))}
        <form action={signOut}>
          <button type="submit" className="more-out">Sign out</button>
        </form>
      </div>

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

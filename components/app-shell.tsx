import Link from 'next/link';

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

export function AppShell({ current, children }: { current: string; children: React.ReactNode }) {
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
          <span className="topbar-currency">
            Prices in <span className="figure">{ORG.currencySymbol} {ORG.currencyCode}</span>
          </span>
          <span className="topbar-org">{ORG.name}</span>
          <span className="avatar" aria-hidden="true">{initialsOf(ORG.name)}</span>
        </div>
      </header>
      {children}
    </div>
  );
}

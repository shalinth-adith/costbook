import Link from 'next/link';

import { ORG } from '@/lib/data';

const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Recipes', href: '/recipes' },
  { label: 'Ingredients', href: '/ingredients' },
  { label: 'Import', href: '/import' },
  { label: 'Settings', href: '/settings' },
] as const;

/** The costs mark: four bars, line only, on the 16px grid. */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M3 16V8m4.7 8V4m4.6 12v-6M17 16V6" />
    </svg>
  );
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
        </div>
      </header>
      {children}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * The rail's items, and what is waiting behind each.
 *
 * A count sits on the item rather than inside the page it belongs to, so the
 * console can be read without touring it. Nought is not shown: a row of
 * zeroes teaches nothing and makes the one number that matters harder to see.
 */
const ITEMS: readonly {
  readonly href: string;
  readonly said: string;
  readonly of?: 'support' | 'mail' | 'health';
  readonly why: string;
}[] = [
  { href: '/admin', said: 'Metrics', why: 'How far kitchens get, and what they pay' },
  { href: '/admin/accounts', said: 'Accounts', why: 'Every kitchen, one to a row' },
  { href: '/admin/support', said: 'Support', of: 'support', why: 'Who is waiting on a reply' },
  { href: '/admin/mail', said: 'Mail', of: 'mail', why: 'Written, and whether it went out' },
  { href: '/admin/health', said: 'Health', of: 'health', why: 'What broke' },
];

export function AdminNav({
  counts,
}: {
  counts: { readonly support: number; readonly mail: number; readonly health: number };
}) {
  const here = usePathname();

  return (
    <nav className="ba-nav" aria-label="Back office">
      {ITEMS.map((item) => {
        // Exact for the index, prefix for the rest: /admin must not light up
        // on every page beneath it.
        const on = item.href === '/admin' ? here === '/admin' : here.startsWith(item.href);
        const n = item.of === undefined ? 0 : counts[item.of];
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`ba-item${on ? ' is-on' : ''}`}
            aria-current={on ? 'page' : undefined}
          >
            <span className="ba-item-said">{item.said}</span>
            {n > 0 && (
              <span className={`ba-item-n figure is-${item.of ?? ''}`}>{n}</span>
            )}
            <span className="ba-item-why">{item.why}</span>
          </Link>
        );
      })}
    </nav>
  );
}

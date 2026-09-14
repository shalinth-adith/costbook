import Link from 'next/link';

import { Wordmark } from './wordmark';

/**
 * What a screen looks like while its figures are still on their way.
 *
 * Measured before it was written: every page in this product is dynamic and
 * waits on Supabase, and the median wait on a warm dev server is about 440ms
 * — of which the costing arithmetic is about five. The rest is the round trip
 * to the database. Nothing can make that instant, so the honest thing is to
 * stop showing a blank page while it happens.
 *
 * THE SHAPE IS THE POINT. A spinner says "wait"; a skeleton says "a table of
 * dishes is coming, and it will be about this big". The second is a promise
 * the arriving page keeps, so the screen does not jump when it lands. Which
 * means these blocks have to match the real layout — when a page changes
 * shape, its skeleton is part of the change.
 */
export function Sk({
  w,
  h = 14,
  r,
}: {
  /** Width, as any CSS length. Defaults to filling the space. */
  w?: string;
  /** Height in px — 14 reads as a line of text, 28 as a heading. */
  h?: number;
  /** Corner radius in px, for a block that is not a line of type. */
  r?: number;
}) {
  return (
    <span
      className="sk"
      aria-hidden="true"
      style={{
        inlineSize: w ?? '100%',
        blockSize: `${String(h)}px`,
        borderRadius: `${String(r ?? Math.min(6, h / 2))}px`,
      }}
    />
  );
}

/** The five destinations, drawn but not costed — the nav must not vanish. */
const NAV = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Recipes', href: '/recipes' },
  { label: 'Ingredients', href: '/ingredients' },
  { label: 'Import', href: '/import' },
  { label: 'Settings', href: '/settings' },
] as const;

/**
 * The application's frame, around a page that has not arrived.
 *
 * `loading.tsx` replaces the whole page, and this product's layout is only
 * `html` and `body` — every screen draws its own shell. So a skeleton without
 * the top bar would blink the navigation out of existence on every click,
 * which is a worse answer than the blank page it replaces. The links here are
 * real: somebody who pressed Recipes by mistake can leave without waiting for
 * Recipes to arrive first.
 */
export function ShellSkeleton({
  current,
  children,
}: {
  current: (typeof NAV)[number]['label'];
  children: React.ReactNode;
}) {
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
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="topbar-end">
          <Sk w="92px" h={16} />
        </div>
      </header>

      {/*
        * Said once, quietly, for a screen reader.
        *
        * The blocks themselves are `aria-hidden`: announcing eleven grey
        * rectangles is noise. `role="status"` with `aria-live="polite"` waits
        * for a gap in whatever is being read rather than interrupting.
        */}
      <p className="visually-hidden" role="status" aria-live="polite">
        Loading {current.toLowerCase()}…
      </p>
      <div className="sk-page">{children}</div>
    </div>
  );
}

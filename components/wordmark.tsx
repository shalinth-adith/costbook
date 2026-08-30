'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Mark } from './mark';

/**
 * The wordmark, as a control (A34).
 *
 * It sits top-left on every screen and every user already expects it to be the
 * way home. That makes it a control, and a control needs a hit area, a hover,
 * a focus ring and a name.
 *
 * Two rules decide where it goes. Never navigate to the page you are already
 * on — a reload that looks like nothing happened is worse than no control at
 * all. And never cross the signed-in boundary: the mark takes a signed-in user
 * to their dashboard, never back out to marketing.
 */
export type WordmarkMode =
  /** In the app. Home is the dashboard. */
  | 'app'
  /** On a public page. Home is the landing page. */
  | 'public'
  /**
   * Mid-flow — setup or import. Drawn, but not a control: both flows hold
   * unsaved answers, and a logo that quietly discards them is the worst kind
   * of trap. It becomes a control again on the dashboard.
   */
  | 'inert';

export const HOME_OF: Record<Exclude<WordmarkMode, 'inert'>, string> = {
  app: '/dashboard',
  public: '/',
};

export function Wordmark({ mode = 'app', size = 18 }: { mode?: WordmarkMode; size?: number }) {
  const here = usePathname();

  if (mode === 'inert') {
    return (
      <span className="wordmark is-inert">
        <Mark size={size} />
        <span>Costbook</span>
      </span>
    );
  }

  const home = HOME_OF[mode];

  // Already home: scroll to the top rather than reloading the page underneath
  // someone. Still a button, so it keeps the hit area, the focus ring and the
  // name — an inert logo on the dashboard would read as broken.
  if (here === home) {
    return (
      <button
        type="button"
        className="wordmark"
        aria-label="Costbook, home"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <Mark size={size} />
        <span>Costbook</span>
      </button>
    );
  }

  return (
    <Link href={home} className="wordmark" aria-label="Costbook, home">
      <Mark size={size} />
      <span>Costbook</span>
    </Link>
  );
}

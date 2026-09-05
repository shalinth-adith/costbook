'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Wordmark } from './wordmark';

/**
 * The landing header (A29).
 *
 * "Start free" appears in the bar only after the hero has left the screen, so
 * it is never a second call to action competing with the first. One action,
 * said twice, worded identically.
 */
export function LandingNav() {
  const [past, setPast] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mark = sentinel.current;
    if (mark === null) return;
    const watch = new IntersectionObserver(
      ([entry]) => setPast(entry !== undefined && !entry.isIntersecting),
      { threshold: 0 },
    );
    watch.observe(mark);
    return () => watch.disconnect();
  }, []);

  return (
    <>
      <header className="lp-nav">
        <Wordmark mode="public" />
        <nav className="lp-nav-links">
          <Link href="/sign-in" className="lp-link">Sign in</Link>
          {/* Held in the layout at all times so its arrival moves nothing. */}
          <Link
            href="/sign-up"
            className={`btn btn-primary lp-nav-cta${past ? ' is-shown' : ''}`}
            tabIndex={past ? undefined : -1}
            aria-hidden={past ? undefined : true}
          >
            Start free
          </Link>
        </nav>
      </header>
      {/* Sits at the foot of the hero: once this leaves, the bar takes over. */}
      <div ref={sentinel} className="lp-nav-mark" aria-hidden="true" />
    </>
  );
}

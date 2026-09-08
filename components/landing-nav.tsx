"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Wordmark } from "./wordmark";

/**
 * The landing header.
 *
 * It stays with the reader the whole way down: on soot over the hero, then
 * on its own soot ground once the page under it turns white, so the mark and
 * the action are never lost on a light section.
 *
 * "Start free" appears in the bar only after the hero has left the screen,
 * so it is never a second call to action competing with the first. One
 * action, said twice, worded identically.
 *
 * The bar watches a marker the page puts at the foot of the hero (`#lp-fold`)
 * rather than a sentinel of its own: the header sits at the top of the page,
 * and the thing it needs to know about is a long way below it.
 */
export function LandingNav() {
  const [past, setPast] = useState(false);

  useEffect(() => {
    const fold = document.getElementById("lp-fold");
    if (fold === null) return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (entry === undefined) return;
        // Past once the marker is above the top edge — not merely off
        // screen, which is also true before the page has been scrolled at
        // all on a short viewport.
        setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    watch.observe(fold);
    return () => watch.disconnect();
  }, []);

  return (
    <header className={`lp-nav${past ? " is-past" : ""}`}>
      <Wordmark mode="public" />
      <nav className="lp-nav-links" aria-label="Site">
        <Link href="/about" className="lp-link">
          What this is
        </Link>
        <Link href="/sign-in" className="lp-link">
          Sign in
        </Link>
        {/* Held in the layout at all times so its arrival moves nothing. */}
        <Link
          href="/sign-up"
          className={`lp-nav-cta${past ? " is-shown" : ""}`}
          tabIndex={past ? undefined : -1}
          aria-hidden={past ? undefined : true}
        >
          Start free
        </Link>
      </nav>
    </header>
  );
}

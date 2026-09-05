import type { Metadata } from 'next';
import Link from 'next/link';

import { LandingNav } from '@/components/landing-nav';
import { LandingRate } from '@/components/landing-rate';
import { PAID_MONTHLY } from '@/lib/org';

import './landing.css';

export const metadata: Metadata = {
  title: 'Costbook — your menu, costed, and still costed when prices move',
  description:
    'Recipe costing for small restaurants. Costbook works out what every dish costs, through its sub-recipes and yields, and keeps it true as your rates change.',
};

/**
 * The landing page (A29).
 *
 * Five blocks: sentence and action · one screen · three lines · price ·
 * footer. A long page reads as selling, and this product's voice is a quiet
 * ledger.
 *
 * The import is not the product. Leading with "send us your spreadsheet"
 * taught every visitor that Costbook reads spreadsheets — it reads one, once.
 * What it does for the next two years is keep a menu true, and that is the
 * headline. The word "import" appears nowhere on this page.
 *
 * Mono is restricted to figures — costs, shares, the price of the product —
 * which makes the numbers feel like the product rather than like marketing.
 */

const LINES: readonly (readonly [string, string])[] = [
  ['01', 'A plate built from a batter, a gravy and a chutney costs what all three cost — yields and all.'],
  ['02', 'Onion goes up. Forty dishes reprice, and three of them cross your target.'],
  ['03', 'Every morning your chef confirms three prices. It takes a minute.'],
];

export default function Landing() {
  return (
    <div className="lp">
      <LandingNav />

      {/* 1 — the sentence, and the one action */}
      <section className="lp-hero">
        <h1>Your menu, costed. And still costed when prices move.</h1>
        <p className="lp-lede">
          Prices move every week, and by the time the sheet is updated it is out of date again.
          Costbook works out what every dish costs and keeps it true as your rates change.
        </p>
        <div className="lp-act">
          {/* To sign-up, not to /setup: setup belongs to an account, so a
              stranger pressing this was bounced to the sign-in screen with a
              next parameter — asked to sign in to a product they have not
              joined. */}
          <Link href="/sign-up" className="btn btn-primary lp-btn-lg">Start free</Link>
          {/* Someone who knows the shape of a wizard finishes it. */}
          <span className="lp-act-said">
            A short setup — your restaurant, then the rules you price by — and then bring your menu in.
          </span>
        </div>
      </section>

      {/* 2 — the one screen */}
      <section className="lp-screen">
        <LandingRate />
      </section>

      {/* 3 — three lines */}
      <section className="lp-lines">
        {LINES.map(([n, said]) => (
          <div className="lp-line-block" key={n}>
            <span className="figure lp-line-n">{n}</span>
            <p>{said}</p>
          </div>
        ))}
      </section>

      {/* 4 — the price */}
      <section className="lp-price">
        <p className="lp-price-said">
          Free to cost your menu.{' '}
          {/* The figure comes from lib/org so this and Settings cannot drift. */}
          <span className="figure lp-price-figure">
            {PAID_MONTHLY.symbol}
            {PAID_MONTHLY.amount}
          </span>{' '}
          a month to keep it current.
        </p>
        <Link href="/sign-up" className="btn btn-primary lp-btn-lg">Start free</Link>
        {/* A person doing work by hand, so it cannot be the primary action —
            it does not scale and it framed the product as a service. */}
        <span className="lp-price-alt">
          Rather we did it?{' '}
          <a href="mailto:hello@costbook.in">Send your sheet and we&rsquo;ll cost it for you.</a>
        </span>
      </section>

      {/* 5 — the footer */}
      <footer className="lp-foot">
        <span className="lp-foot-where">Costbook · Madurai</span>
        <div className="lp-foot-links">
          <Link href="/sign-in">Sign in</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <a className="figure" href="mailto:hello@costbook.in">hello@costbook.in</a>
        </div>
      </footer>
    </div>
  );
}

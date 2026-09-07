import type { Metadata } from 'next';
import Link from 'next/link';

import { LandingNav } from '@/components/landing-nav';
import { LandingRate } from '@/components/landing-rate';
import { FREE_LIMITS, PAID_MONTHLY } from '@/lib/org';

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

/** number · what it is called · what it does */
const LINES: readonly (readonly [string, string, string])[] = [
  [
    '01',
    'Sub-recipes, properly',
    'A plate built from a batter, a gravy and a chutney costs what all three cost — yields and all. The cheap tools handle this badly or not at all, and it is the commonest reason a kitchen\u2019s costing is wrong.',
  ],
  [
    '02',
    'One rate, every dish it reaches',
    'Onion goes up. Forty dishes reprice, and three of them cross your target — including the ones that reach it through a gravy they never list.',
  ],
  [
    '03',
    'And it stays true',
    'Every morning your chef confirms three prices. It takes a minute, and it is the difference between a costing that is right today and one that was right in March.',
  ],
];

/** What each tier is for, said as plainly as the price. */
const FREE_HAS: readonly string[] = [
  `${String(FREE_LIMITS.recipes)} dishes, costed properly`,
  'Sub-recipes, yields and the full breakdown',
  'Every figure you can open and read step by step',
  'Prep cards you can print',
];
const PAID_HAS: readonly string[] = [
  'Your whole menu, no limit',
  'Bring your spreadsheet in, and again each month',
  'Sales in, and the menu ranked by what earns',
  'Seven days to undo a price list',
];

export default function Landing() {
  return (
    <div className="lp">
      {/*
        * The nav, the sentence and the one screen on soot.
        *
        * The dark ground the app carries top and bottom, met before the
        * product is: it gives the page a horizon, and it lights the panel,
        * which is the only thing here that moves.
        */}
      <div className="lp-top">
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

      </div>

      {/* 3 — three lines, across the page rather than down its left edge */}
      <section className="lp-lines">
        {LINES.map(([n, name, said]) => (
          <div className="lp-line-block" key={n}>
            <span className="figure lp-line-n">{n}</span>
            <h2 className="lp-line-h">{name}</h2>
            <p>{said}</p>
          </div>
        ))}
      </section>

      {/* 4 — the price, on soot: two tiers side by side and the figure said once */}
      <section className="lp-price">
        <div className="lp-price-say">
          <p className="lp-eyebrow">What it costs</p>
          <h2 className="lp-price-h">
            Free to cost your menu.{' '}
            {/* The figure comes from lib/org so this and Settings cannot drift. */}
            <span className="figure lp-price-figure">
              {PAID_MONTHLY.symbol}
              {PAID_MONTHLY.amount}
            </span>{' '}
            a month to keep it current.
          </h2>
          <p className="lp-price-note">
            No card to start, and nothing you enter is held hostage: everything on
            the free tier stays costed and printable whatever you decide.
          </p>
        </div>

        <div className="lp-tiers">
          <div className="lp-tier">
            <p className="lp-tier-name">Free</p>
            <p className="figure lp-tier-fig">
              {FREE_LIMITS.recipes} <span>dishes</span>
            </p>
            <ul className="lp-tier-has">
              {FREE_HAS.map((h) => <li key={h}>{h}</li>)}
            </ul>
            <Link href="/sign-up" className="btn btn-primary lp-tier-btn">Start free</Link>
          </div>

          <div className="lp-tier is-paid">
            <p className="lp-tier-name">A plan</p>
            <p className="figure lp-tier-fig">
              {PAID_MONTHLY.symbol}{PAID_MONTHLY.amount} <span>a month</span>
            </p>
            <ul className="lp-tier-has">
              {PAID_HAS.map((h) => <li key={h}>{h}</li>)}
            </ul>
            {/* A person doing work by hand, so it cannot be the primary action —
                it does not scale and it framed the product as a service. */}
            <span className="lp-tier-alt">
              Rather we did it?{' '}
              <a href="mailto:hello@costbook.in">Send your sheet and we&rsquo;ll cost it for you.</a>
            </span>
          </div>
        </div>
      </section>

      {/* 5 — the footer */}
      <footer className="lp-foot">
        <div className="lp-foot-top">
          <div>
            <p className="lp-foot-mark">Costbook</p>
            <p className="lp-foot-said">
              Recipe costing for one kitchen. One ingredient, entered once, priced once.
            </p>
          </div>
          <a className="figure lp-foot-mail" href="mailto:hello@costbook.in">hello@costbook.in</a>
        </div>
        <div className="lp-foot-links">
          <Link href="/about">What this is</Link>
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up">Start free</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </div>
  );
}

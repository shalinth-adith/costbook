import type { Metadata } from "next";
import Link from "next/link";

import { LandingNav } from "@/components/landing-nav";
import { LandingRate } from "@/components/landing-rate";
import { LandingRipple } from "@/components/landing-ripple";
import { LandingTicker } from "@/components/landing-ticker";
import { FREE_LIMITS, PAID_MONTHLY } from "@/lib/org";

import "./landing.css";

export const metadata: Metadata = {
  title: "Costbook — your menu, costed, and still costed when prices move",
  description:
    "Recipe costing for small restaurants. Costbook works out what every dish costs, through its sub-recipes and yields, and keeps it true as your rates change.",
};

/**
 * The entry screen.
 *
 * Six blocks: the sentence with the ripple beside it · the rate strip · the
 * screen itself · three lines · the price · the footer. The first is the
 * only one allowed to be theatre — the owner asked for a page that captures
 * the person who lands on it, and motion at any cost — and everything under
 * it arrives as it is reached and then holds still to be read.
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
    "01",
    "Sub-recipes, properly",
    "A plate built from a batter, a gravy and a chutney costs what all three cost — yields and all. The cheap tools handle this badly or not at all, and it is the commonest reason a kitchen’s costing is wrong.",
  ],
  [
    "02",
    "One rate, every dish it reaches",
    "Onion goes up. Forty dishes reprice, and three of them cross your target — including the ones that reach it through a gravy they never list.",
  ],
  [
    "03",
    "And it stays true",
    "Every morning your chef confirms three prices. It takes a minute, and it is the difference between a costing that is right today and one that was right in March.",
  ],
];

/** What each tier is for, said as plainly as the price. */
const FREE_HAS: readonly string[] = [
  `${String(FREE_LIMITS.recipes)} dishes, costed properly`,
  "Sub-recipes, yields and the full breakdown",
  "Every figure you can open and read step by step",
  "Prep cards you can print",
];
const PAID_HAS: readonly string[] = [
  "Your whole menu, no limit",
  "Bring your spreadsheet in, and again each month",
  "Sales in, and the menu ranked by what earns",
  "Seven days to undo a price list",
];

export default function Landing() {
  return (
    <div className="lp">
      {/*
       * The entry screen, on soot.
       *
       * The words on the left, the ripple on the right, the rate strip along
       * the foot. The dark ground the app carries top and bottom, met before
       * the product is: it gives the page a horizon, and it lights everything
       * that moves.
       */}
      <div className="lp-top">
        <div className="lp-top-bg" aria-hidden="true" />
        <LandingNav />

        <section className="lp-hero">
          <div className="lp-hero-say">
            <p className="lp-eyebrow lp-hero-eyebrow">
              Recipe costing · one kitchen
            </p>
            <h1 className="lp-h1">
              <span className="lp-h1-line">Your menu, costed.</span>
              <span className="lp-h1-line">And still costed</span>
              <span className="lp-h1-line is-lit">when prices move.</span>
            </h1>
            <p className="lp-lede">
              Prices move every week, and by the time the sheet is updated it is
              out of date again. Costbook works out what every dish costs and
              keeps it true as your rates change.
            </p>
            <div className="lp-act">
              {/* To sign-up, not to /setup: setup belongs to an account, so a
                  stranger pressing this was bounced to the sign-in screen with
                  a next parameter — asked to sign in to a product they have
                  not joined. */}
              <Link href="/sign-up" className="lp-btn-hero">
                Start free
                <span className="lp-btn-hero-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
              <a href="#screen" className="lp-act-more">
                See the screen
              </a>
            </div>
            <ul className="lp-proof">
              <li>No card to start</li>
              <li>
                <b className="figure">{FREE_LIMITS.recipes}</b> dishes free, for
                good
              </li>
              <li>A short setup, then your menu</li>
            </ul>
          </div>

          <LandingRipple />
        </section>

        <LandingTicker />
      </div>

      {/* 2 — the screen itself, not a picture of it */}
      <section className="lp-screen" id="screen">
        <div className="lp-screen-say">
          <p className="lp-eyebrow">The screen</p>
          <h2 className="lp-h2">
            One rate moved this morning.{" "}
            <span className="lp-h2-quiet">This is what you see.</span>
          </h2>
          <p className="lp-screen-note">
            Not a chart and not a report — the page a chef opens with a supplier
            on the phone. Onion went up; here is every dish it reached, and
            which of them crossed the line you set.
          </p>
          <ul className="lp-screen-has">
            <li>Every figure opens to show its working</li>
            <li>
              Dishes that reach an ingredient through a base are found, not
              guessed
            </li>
            <li>
              Your target is a line on the page, not a number in your head
            </li>
          </ul>
        </div>
        <div className="lp-screen-panel">
          <LandingRate />
        </div>
      </section>

      {/* 3 — three lines, across the page rather than down its left edge */}
      <section className="lp-lines">
        <div className="lp-lines-head">
          <p className="lp-eyebrow">Why it is right when the sheet is not</p>
          <h2 className="lp-h2">Three things a spreadsheet cannot follow.</h2>
        </div>
        <div className="lp-lines-row">
          {LINES.map(([n, name, said]) => (
            <div className="lp-line-block" key={n}>
              <span className="figure lp-line-n">{n}</span>
              <h3 className="lp-line-h">{name}</h3>
              <p>{said}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — the price, on soot: two tiers side by side and the figure said once */}
      <section className="lp-price">
        <div className="lp-price-say">
          <p className="lp-eyebrow">What it costs</p>
          <h2 className="lp-price-h">
            Free to cost your menu.{" "}
            {/* The figure comes from lib/org so this and Settings cannot drift. */}
            <span className="figure lp-price-figure">
              {PAID_MONTHLY.symbol}
              {PAID_MONTHLY.amount}
            </span>{" "}
            a month to keep it current.
          </h2>
          <p className="lp-price-note">
            No card to start, and nothing you enter is held hostage: everything
            on the free tier stays costed and printable whatever you decide.
          </p>
        </div>

        <div className="lp-tiers">
          <div className="lp-tier">
            <p className="lp-tier-name">Free</p>
            <p className="figure lp-tier-fig">
              {FREE_LIMITS.recipes} <span>dishes</span>
            </p>
            <ul className="lp-tier-has">
              {FREE_HAS.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            <Link href="/sign-up" className="btn btn-primary lp-tier-btn">
              Start free
            </Link>
          </div>

          <div className="lp-tier is-paid">
            <p className="lp-tier-name">A plan</p>
            <p className="figure lp-tier-fig">
              {PAID_MONTHLY.symbol}
              {PAID_MONTHLY.amount} <span>a month</span>
            </p>
            <ul className="lp-tier-has">
              {PAID_HAS.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
            {/* A person doing work by hand, so it cannot be the primary action —
                it does not scale and it framed the product as a service. */}
            <span className="lp-tier-alt">
              Rather we did it?{" "}
              <a href="mailto:hello@costbook.in">
                Send your sheet and we&rsquo;ll cost it for you.
              </a>
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
              Recipe costing for one kitchen. One ingredient, entered once,
              priced once.
            </p>
          </div>
          <a className="figure lp-foot-mail" href="mailto:hello@costbook.in">
            hello@costbook.in
          </a>
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

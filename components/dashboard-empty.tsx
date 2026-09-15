import Link from 'next/link';
import type { CSSProperties } from 'react';

import { FREE_LIMITS } from '@/lib/org';

/**
 * A42 state one — nothing costed yet.
 *
 * Per A35 an empty dashboard is not a dashboard showing nought: no stat cards
 * reading 0, no chart frame with no chart in it. One sentence, one action, and
 * what will appear here once there is something to appear.
 *
 * THE SKETCH. "What lands here" used to be three bullet points. It is now
 * three small drawings — a ring, a list, a line — with those same three
 * sentences as their captions. They carry no figures at all (A35 again, and
 * A15: no figure ever animates its value), only the shapes the finished page
 * is made of, drawn in hairline the way a blueprint is. They draw themselves
 * in once, on arrival, which is the one honest animation this screen can
 * have: not "here are your numbers", but "here is where they will go".
 *
 * ONE CARD. The page used to stack the start rail's "Cost one dish." above
 * this screen's "Cost one dish, and this page starts working." — two
 * headlines and two orange buttons for one action. This is the screen until
 * there is a dish; the rail comes in after, when it has something to say
 * that this cannot.
 *
 * The ten-minutes line is deliberate. The first dish is slow because the
 * operator is teaching the product their ingredients as they go; saying so —
 * and saying the second takes two — is what stops someone abandoning at minute
 * four believing it is always like this.
 */

const LANDS = [
  { n: '01', said: 'What each dish costs you, and what it should sell for.', draw: RingAndBars },
  { n: '02', said: 'A short list of prices to confirm each morning.', draw: Rows },
  { n: '03', said: 'A note when a rate moves and a dish stops making money.', draw: Spark },
] as const;

export function DashboardEmpty({ target, used }: { target: number; used: number }) {
  const left = Math.max(0, FREE_LIMITS.recipes - used);

  return (
    <div className="fd fd-empty">
      <div className="fd-lead">
        <p className="fd-step">Start here</p>
        <h1 className="fd-h">Cost one dish, and this page starts working.</h1>
        <p className="fd-lede">
          Pick the one you sell most of. You&rsquo;ll list what goes into it, we&rsquo;ll price it
          from your rates, and from then on it recosts itself whenever a rate moves.
        </p>
        <div className="fd-act">
          <Link href="/recipes?new=1" className="btn btn-primary fd-btn">
            Cost your first dish
          </Link>
          {left > 0 ? (
            <span className="fd-left">
              <b className="figure">{left}</b> of <b className="figure">{FREE_LIMITS.recipes}</b>{' '}
              free dishes left
            </span>
          ) : null}
        </div>
        <p className="fd-act-said">
          Ten minutes for the first one — you&rsquo;re teaching us your ingredients as you go. The
          second takes two.
        </p>
        <p className="fd-other">
          Have a spreadsheet? <Link href="/import">Bring the whole menu in</Link> instead.
        </p>
      </div>

      <section className="fd-lands" aria-labelledby="fd-lands-h">
        <h2 className="fd-h2" id="fd-lands-h">What lands here once you have</h2>
        <ol className="fd-land-list">
          {LANDS.map(({ n, said, draw: Draw }, i) => (
            <li className="fd-land" key={n} style={{ '--i': i } as CSSProperties}>
              <div className="fd-draw" aria-hidden="true">
                <Draw />
              </div>
              <p className="fd-land-p">
                <span className="figure fd-land-n">{n}</span>
                {said}
              </p>
            </li>
          ))}
        </ol>
        <p className="fd-settled">
          Currency, tax and your <span className="figure">{target}%</span> target are already set
          from setup. Nothing else needs configuring.
        </p>
      </section>
    </div>
  );
}

/*
 * The drawings.
 *
 * Hairline, dashed where a thing is not yet there, and one solid stroke where
 * the finished page will have a figure. Nothing is labelled with a number.
 * Each is a 112×48 viewBox so the three sit in one column at one size.
 */

/** The food-cost ring and the two bars beside it (cost, and price). */
function RingAndBars() {
  // r=17 → circumference ≈ 106.8; the solid arc stops well short of a full turn.
  return (
    <svg viewBox="0 0 112 48" className="fd-svg">
      <circle className="fd-ghost" cx="24" cy="24" r="17" />
      <circle className="fd-ring" cx="24" cy="24" r="17" pathLength="100" />
      <rect className="fd-bar" x="54" y="14" width="52" height="7" rx="3.5" />
      <rect className="fd-bar fd-bar-2" x="54" y="27" width="34" height="7" rx="3.5" />
    </svg>
  );
}

/** Three rows, each a rate to confirm, each with its own tick-box. */
function Rows() {
  return (
    <svg viewBox="0 0 112 48" className="fd-svg">
      {[0, 1, 2].map((r) => (
        <g key={r} className="fd-row" style={{ '--r': r } as CSSProperties}>
          <rect className="fd-ghost" x="6" y={6 + r * 14} width="9" height="9" rx="2" />
          <rect className="fd-stub" x="22" y={8.5 + r * 14} width={[64, 48, 56][r]} height="4" rx="2" />
        </g>
      ))}
    </svg>
  );
}

/** A rate over time, and the point where it moved. */
function Spark() {
  return (
    <svg viewBox="0 0 112 48" className="fd-svg">
      <line className="fd-ghost" x1="6" y1="40" x2="106" y2="40" />
      <polyline className="fd-line" points="6,30 26,29 46,31 66,30 80,29 86,14 106,13" pathLength="100" />
      <circle className="fd-dot" cx="86" cy="14" r="3.5" />
    </svg>
  );
}

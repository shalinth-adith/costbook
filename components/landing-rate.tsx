'use client';

import { useEffect, useState } from 'react';

/**
 * The one screen on the landing page (A29).
 *
 * Not a table of costed dishes — that looks like the spreadsheet the reader
 * already keeps, and proves only that the product makes numbers, which was
 * never in doubt. This shows the moment nothing else can: onion moves and
 * eleven dishes follow, three of them through a gravy they never list.
 *
 * It plays once. The panel loads at 42.00 with the dishes under target, waits
 * a beat, and the rate changes. Per A15 every figure cuts straight to its new
 * value — nothing counts up, nothing slides — and the changed cells take a
 * tint that holds 1.2s and fades over 420ms. No stagger: all four move
 * together, because one rate reaching eleven dishes at once is the claim, and
 * rippling them would suggest the product is working through a queue.
 *
 * It never loops. A landing page that keeps moving while you read it is an
 * advertisement.
 */

/** name · what it reaches through · before · after · does it cross the target */
const DISHES: readonly (readonly [string, string, string, string, boolean])[] = [
  ['Vada Curry (2 pc)', 'via Chicken Kuruma', '31.2', '33.6', true],
  ['Ennai Kathirikai Kuzhambu', 'via Onion Thakkali Gravy', '31.0', '33.1', true],
  ['Kaima Idly', 'via Onion Thakkali Gravy', '31.6', '32.4', true],
  ['Parotta Kuruma Plate', 'via Chicken Kuruma', '38.9', '41.9', false],
];

const BEFORE = 700;
const CHANGE = 1400;
const TINT_HOLD = 1200;

export function LandingRate() {
  /** 0 before the rate moves, 1 after. The tint is separate: it fades alone. */
  const [moved, setMoved] = useState(false);
  const [tint, setTint] = useState(false);

  useEffect(() => {
    // Reduced motion gets the finished state and no animation — the claim is
    // in the figures, not in their arrival.
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setMoved(true);
      return;
    }

    const timers: number[] = [
      window.setTimeout(() => {
        setMoved(true);
        setTint(true);
      }, BEFORE + CHANGE),
      window.setTimeout(() => setTint(false), BEFORE + CHANGE + TINT_HOLD),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <div className="lp-panel">
      <div className="lp-panel-rate">
        <span className="lp-panel-rate-name">Onion, big</span>
        <span className="lp-panel-rate-move">
          {moved ? (
            <>
              <span className="figure lp-panel-was">42.00</span>
              <span className="figure lp-panel-arrow" aria-hidden="true">&rarr;</span>
            </>
          ) : null}
          <span className={`figure lp-panel-rate-now${tint ? ' is-tinted' : ''}`}>
            {moved ? '60.00' : '42.00'}
          </span>
        </span>
        <span className="lp-panel-rate-unit">a kilo</span>
        <span className="figure lp-panel-rate-when">this morning</span>
      </div>

      {/* One line, replaced rather than retyped. A figure never animates its
          value, and neither does the sentence that reports it. */}
      <p className="lp-panel-lead" aria-live="polite">
        {moved ? '11 dishes move. 3 cross your 32% target.' : 'Onion is in 11 of your dishes.'}
      </p>

      <div className="lp-panel-rows">
        {DISHES.map(([name, via, was, now, crosses]) => {
          const value = moved ? now : was;
          // "was over" only once there is a past to refer to.
          const mark = moved
            ? crosses ? 'CROSSES' : 'WAS OVER'
            : crosses ? 'UNDER' : 'OVER';
          const tone = moved && crosses ? 'crosses' : crosses ? 'under' : 'over';
          return (
            <div className="lp-panel-row" key={name}>
              <span className="lp-panel-row-said">
                <span className="lp-panel-row-name">{name}</span>
                <span className="lp-panel-row-via">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
                    strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M2 2v5.6a2 2 0 0 0 2 2h6" />
                    <path d="M8 7.6 10 9.6 8 11.6" />
                  </svg>
                  {via}
                </span>
              </span>
              <span className="lp-panel-row-figures">
                {moved ? (
                  <>
                    <span className="figure lp-panel-was">{was}%</span>
                    <span className="figure lp-panel-arrow" aria-hidden="true">&rarr;</span>
                  </>
                ) : null}
                <span
                  className={`figure lp-panel-fc${Number(value) > 32 ? ' is-over' : ''}${
                    tint ? (crosses ? ' is-tinted-over' : ' is-tinted') : ''
                  }`}
                >
                  {value}%
                </span>
                <span className={`figure lp-panel-mark is-${tone}`}>{mark}</span>
              </span>
            </div>
          );
        })}
      </div>

      <span className="figure lp-panel-foot">
        {moved ? '7 more move by less than a point' : 'nothing has changed yet'}
      </span>
    </div>
  );
}

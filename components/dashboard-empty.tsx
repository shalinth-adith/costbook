'use client';

import Link from 'next/link';

/**
 * The dashboard with nothing to rank.
 *
 * NO FRAME EXISTS FOR THIS SCREEN. Built in A35's shape and flagged as a gap:
 * a screen with no data shows no controls for filtering it, the invitation
 * takes the space rather than sitting in a corner of it, and the right column
 * answers what would fill the page.
 *
 * The dashboard's whole argument is the sort order — every dish, worst food
 * cost first, against one target line. With nothing to sort there is no
 * argument to make, only one to explain.
 */

/** Illustrative, and labelled as such. The same three rows as A29 and A35. */
const SHOWN = [
  { name: 'Mutton Kothu Parotta', share: '44.0%', over: true },
  { name: 'Chicken 65', share: '39.3%', over: true },
  { name: 'Ghee Roast Masala Dosa', share: '31.9%', over: false },
] as const;

export function DashboardEmpty({ target }: { target: number }) {
  return (
    <div className="rx-empty">
      <div className="rx-empty-lead">
        <h1 className="rx-empty-h">Nothing to rank yet.</h1>
        <p className="rx-empty-lede">
          This page puts every dish in order of what it costs you as a share of what it sells for,
          worst first, against your {target.toFixed(1)}% target. It needs a menu to do that, and the
          fastest way to one is the sheet you already keep.
        </p>
      </div>

      <div className="rx-empty-grid">
        <Link href="/import" className="rx-drop">
          <span className="rx-drop-title">Bring your spreadsheet in</span>
          <span className="rx-drop-copy">
            Whatever shape it&rsquo;s in. We show you which column we think is which, read one of
            your own rows back as a sentence, and keep the columns we can&rsquo;t place rather than
            dropping them.
          </span>
          <span className="btn btn-primary rx-drop-btn">Choose a file</span>
          <span className="rx-drop-formats figure">.xlsx · .xls · .csv · Google Sheets link</span>
          <span className="rx-drop-trust">Your file is read, never altered</span>
        </Link>

        <div className="rx-empty-side">
          <section className="rx-panel">
            <h2 className="rx-panel-h">What this page becomes</h2>
            <div className="rx-shot-head">
              <span>Dish</span>
              <span className="end">Share of its price</span>
            </div>
            {SHOWN.map((d) => (
              <div className="rx-shot-row is-two" key={d.name}>
                <span>{d.name}</span>
                <span className="figure end" data-over={d.over}>{d.share}</span>
              </div>
            ))}
            <p className="rx-panel-note">
              Worst first, so the dishes losing you money are the ones you see. A worked example —
              your own figures replace it.
            </p>
          </section>

          <section className="rx-panel">
            <h2 className="rx-panel-h">Nothing here is guessed</h2>
            <p className="rx-panel-copy">
              A dish missing a rate reports a floor rather than a cost, and says so. Costbook will
              not put a figure on this page that you did not give it.
            </p>
          </section>

          <section className="rx-panel">
            <h2 className="rx-panel-h">No sheet to import?</h2>
            <p className="rx-panel-copy">
              Cost one dish by hand and this page fills in from there. The first takes a few
              minutes, because you&rsquo;re teaching us your ingredients as you go — the second is
              much faster.
            </p>
            <Link href="/recipes" className="btn rx-panel-btn">Add a dish by hand</Link>
          </section>
        </div>
      </div>
    </div>
  );
}

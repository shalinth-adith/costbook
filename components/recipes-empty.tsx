'use client';

import Link from 'next/link';

/**
 * Recipes with nothing in it (A35).
 *
 * Empty is not a list with nothing in it — it is a different screen. The
 * version this replaces kept a toolbar for filtering nothing, a search field
 * for searching nothing, five filter chips, two tab counts reading 0, and
 * "0 shown" in the corner, and pushed the only real content into a corner of a
 * page-sized void.
 *
 * The drop zone takes the whole left column because a file being dragged needs
 * somewhere to land: a large target is the feature, not padding. The right
 * column answers the two objections an owner actually has — what will I get,
 * and is my sheet tidy enough — and keeps the by-hand door quiet and second.
 */

/** The same three rows as A29. Illustrative, and labelled as such. */
const SHOWN = [
  { name: 'Mutton Kothu Parotta', cost: '96.40', share: '44.0%' },
  { name: 'Parotta Kuruma Plate', cost: '46.30', share: '38.9%' },
  { name: 'Ghee Roast Masala Dosa', cost: '41.20', share: '31.9%' },
] as const;

export function RecipesEmpty() {
  return (
    <div className="rx-empty">
      <div className="rx-empty-lead">
        <h1 className="rx-empty-h">Let&rsquo;s get your menu in.</h1>
        <p className="rx-empty-lede">
          Every dish you cost here gets a plate cost, a suggested price and a food cost percentage
          that stays right as your rates move. The fastest way to all of it is the sheet you already
          keep.
        </p>
      </div>

      <div className="rx-empty-grid">
        {/* The only filled control on the screen. One primary action, not two. */}
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
            <h2 className="rx-panel-h">What comes out the other side</h2>
            <div className="rx-shot-head">
              <span>Dish</span>
              <span className="end">Cost</span>
              <span className="end">Share</span>
            </div>
            {SHOWN.map((d) => (
              <div className="rx-shot-row" key={d.name}>
                <span>{d.name}</span>
                <span className="figure end">{d.cost}</span>
                <span className="figure end">{d.share}</span>
              </div>
            ))}
            <p className="rx-panel-note">
              A real café&rsquo;s sheet, imported. Twenty-one dishes, costed and sorted worst first,
              in about a minute.
            </p>
          </section>

          <section className="rx-panel">
            <h2 className="rx-panel-h">Not sure your sheet is tidy enough?</h2>
            <p className="rx-panel-copy">
              It almost certainly is. Merged cells, blank rows, three sheets in one file, prices with
              the currency typed in — we&rsquo;ve read all of it. Send it and see.
            </p>
          </section>

          {/* Kept quiet and second: it is the slower path. */}
          <section className="rx-panel">
            <h2 className="rx-panel-h">No sheet to import?</h2>
            <p className="rx-panel-copy">
              Cost one dish by hand and this screen fills in from there. It takes a few minutes for
              the first one, because you&rsquo;re teaching us your ingredients as you go — the second
              is much faster.
            </p>
            <Link href="/recipes?new=1" className="btn rx-panel-btn">Add a dish by hand</Link>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * One dish in is still nearly empty (A35).
 *
 * A one-row table under a full filter bar is the same mistake in miniature, so
 * the toolbar stays away until the list earns it. The import invitation returns
 * as a band beneath the row, and now argues from something the owner has
 * watched work.
 */
export function RecipesNearlyEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rx-few">
      {children}
      <div className="rx-band">
        <h2 className="rx-band-h">That&rsquo;s one. The other forty don&rsquo;t have to be typed.</h2>
        <p className="rx-band-copy">
          Now that you&rsquo;ve seen what a costed dish looks like, bring the sheet in — the
          ingredients you just entered are matched against it rather than duplicated.
        </p>
        <Link href="/import" className="btn btn-primary">Import the rest</Link>
      </div>
    </div>
  );
}

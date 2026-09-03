import Link from "next/link";

import type { Place, Stance } from "@/lib/place";
import { percent } from "@/lib/format";

/**
 * The place — what this kitchen cooks, and how it costs.
 *
 * The page behind the wordmark. It answers neither of the questions the other
 * screens answer: not "what changed" (the dashboard) and not "where is that
 * dish" (Recipes), but "what is this book". A menu has a shape — mostly tiffin
 * with four beverages, or the other way round — and nowhere in the product
 * said so.
 *
 * A server component. Nothing here is edited; every figure is read.
 */

/**
 * The share bar.
 *
 * Width alone would be a chart with one series and no axis, so the count sits
 * beside it and the bar is the comparison. Not a colour scale: a section is
 * not better or worse for being large, and the status inks are spoken for.
 */
function ShareBar({ share }: { share: number }) {
  return (
    <span className="place-bar" aria-hidden="true">
      <span className="place-bar-fill" style={{ width: `${String(share)}%` }} />
    </span>
  );
}

export function PlaceView({
  place,
  stance,
}: {
  place: Place;
  stance: readonly Stance[];
}) {
  const { sections, shared } = place;

  return (
    <>
      <div className="page-head">
        <div className="page-title-block">
          <h1 className="page-title">{place.name}</h1>
          <p className="page-sub">
            {place.dishes === 0 ? (
              <>
                Nothing on the menu yet. The book starts when the first dish
                does.
              </>
            ) : (
              <>
                <span className="figure strong">{place.dishes}</span>{" "}
                {place.dishes === 1 ? "dish" : "dishes"} across{" "}
                <span className="figure strong">{sections.length}</span>{" "}
                {sections.length === 1 ? "section" : "sections"}, built from{" "}
                <span className="figure strong">{place.ingredients}</span>{" "}
                ingredients
                {place.batches > 0 ? (
                  <>
                    {" "}
                    and <span className="figure strong">
                      {place.batches}
                    </span>{" "}
                    {place.batches === 1 ? "batch" : "batches"}
                  </>
                ) : null}
                .
              </>
            )}
          </p>
        </div>
      </div>

      {place.dishes > 0 && (
        <div className="stats stats-3">
          <div className="stat">
            <span className="label">On the menu</span>
            <span className="stat-row">
              <span className="figure stat-figure">{place.onMenu}</span>
              <span className="stat-note">of {place.dishes} carry a price</span>
            </span>
          </div>
          <div className="stat">
            <span className="label">Costed in full</span>
            <span className="stat-row">
              <span className="figure stat-figure">{place.costed}</span>
              <span className="stat-note">
                {/* The rest report a floor, which is not a cost. Said here
                    rather than left to be inferred from the difference. */}
                {place.dishes - place.costed === 0
                  ? "every dish states a real cost"
                  : `${place.dishes - place.costed} still report a floor, not a cost`}
              </span>
            </span>
          </div>
          <div className="stat">
            <span className="label">Biggest section</span>
            <span className="stat-row">
              <span className="figure stat-figure">
                {sections[0]?.dishes ?? 0}
              </span>
              <span className="stat-note">{sections[0]?.name ?? "—"}</span>
            </span>
          </div>
        </div>
      )}

      {sections.length > 0 && (
        <section className="place-block">
          <h2 className="place-h">What you cook</h2>
          <p className="place-lede">
            Sections by size. Where <em>costed</em> trails <em>dishes</em>, a
            rate is missing somewhere underneath.
          </p>

          <div className="card place-table">
            <div className="place-head">
              <span>Section</span>
              <span className="end">Dishes</span>
              <span className="end">Costed</span>
              <span className="end">Priced</span>
              <span>Share of the menu</span>
            </div>

            {sections.map((s) => (
              <div className="place-row" key={s.name}>
                <span className="place-name">{s.name}</span>
                <span className="figure end">{s.dishes}</span>
                <span
                  className={`figure end${s.costed < s.dishes ? " place-short" : ""}`}
                >
                  {s.costed}
                </span>
                <span className="figure end place-dim">{s.onMenu}</span>
                <span className="place-share">
                  <ShareBar share={s.share} />
                  <span className="figure place-share-figure">
                    {percent(s.share)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {shared.length > 0 && (
        <section className="place-block">
          <h2 className="place-h">What the menu is built on</h2>
          <p className="place-lede">
            Batches more than one dish leans on. A rate change inside one of
            these moves every dish above it at once — which is the whole reason
            they are worth naming.
          </p>
          <ul className="place-chips">
            {shared.map((b) => (
              <li key={b.name} className="place-chip">
                <span className="place-chip-name">{b.name}</span>
                <span className="figure place-chip-count">
                  {b.usedIn} dishes
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="place-block">
        <h2 className="place-h">How you cost</h2>
        <p className="place-lede">
          The four answers from setup, in force everywhere. Change any of them
          in{" "}
          <Link href="/settings" className="link">
            Settings
          </Link>
          , or on the dish where it acts.
        </p>
        <dl className="card place-stance">
          {stance.map((s) => (
            <div className="place-stance-row" key={s.label}>
              <dt>{s.label}</dt>
              <dd>{s.said}</dd>
            </div>
          ))}
        </dl>
      </section>

      {place.dishes === 0 && (
        <section className="place-block">
          <p className="place-lede">
            <Link href="/recipes?new=1" className="link">
              Cost your first dish
            </Link>{" "}
            and this page fills in on its own.
          </p>
        </section>
      )}
    </>
  );
}

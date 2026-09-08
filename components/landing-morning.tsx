/**
 * The morning confirm, along the foot of the entry screen.
 *
 * The ripple above it tells the first two lines of the page: one rate,
 * every dish it reaches. It cannot tell the third — "and it stays true" —
 * because that is not a moment, it is a ritual: every morning the chef
 * confirms a few prices, and that minute is the difference between a costing
 * that is right today and one that was right in March.
 *
 * So this is one morning. A time, three rates, and a stamp landing on each in
 * turn — once, after the ripple's first reprice, so the two read as a
 * sequence: prices moved, chef confirmed. Then it is a record and it holds.
 *
 * What it replaced was a strip of rates sliding past. That is the move every
 * generated page makes, and a person who has seen it three times reads it as
 * "this was not designed". A stamp on a page is what this product actually
 * is: a book somebody keeps.
 */

interface Confirmed {
  readonly name: string;
  readonly rate: string;
  readonly unit: string;
  /** Where it was, when it moved. Null means it held. */
  readonly was: string | null;
}

const MORNING: readonly Confirmed[] = [
  { name: "Onion, large", rate: "60.00", unit: "kg", was: "42.00" },
  { name: "Chicken thigh", rate: "310", unit: "kg", was: null },
  { name: "Tomato", rate: "21.00", unit: "kg", was: "18.00" },
];

export function LandingMorning() {
  return (
    <section className="lp-morning" aria-label="This morning's confirmations">
      <div className="lp-morning-say">
        <p className="figure lp-morning-when">
          <span className="lp-morning-day">Tuesday</span>
          <span className="lp-morning-time">07:41</span>
        </p>
        <p className="lp-morning-line">
          Three prices, one minute. <span>That is the whole ritual.</span>
        </p>
      </div>

      <ol className="lp-morning-row">
        {MORNING.map((c, i) => (
          <li
            key={c.name}
            className={`lp-stamp-card${c.was === null ? " is-held" : ""}`}
            style={{ "--lp-stamp-i": i } as React.CSSProperties}
          >
            <span className="lp-stamp-name">{c.name}</span>
            <span className="figure lp-stamp-rate">
              {c.rate}
              <span className="lp-stamp-unit">/{c.unit}</span>
            </span>
            <span className="figure lp-stamp-was">
              {c.was === null ? "held" : `was ${c.was}`}
            </span>
            {/* The mark. Rotated a few degrees because a stamp never lands
                square, and that is what tells the eye it was pressed by a
                hand rather than typed. */}
            <span className="lp-stamp" aria-hidden="true">
              Confirmed
            </span>
            <span className="lp-stamp-said">confirmed</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

import Link from 'next/link';

/**
 * A42 state one — nothing costed yet.
 *
 * Per A35 an empty dashboard is not a dashboard showing nought: no stat cards
 * reading 0, no chart frame with no chart in it. One sentence, one action, and
 * a short list of what will appear here once there is something to appear.
 *
 * The ten-minutes line is deliberate. The first dish is slow because the
 * operator is teaching the product their ingredients as they go; saying so —
 * and saying the second takes two — is what stops someone abandoning at minute
 * four believing it is always like this.
 *
 * Import is one underlined line at the foot. They already chose this door, and
 * the choice stays reversible without being pushed.
 */

const LANDS: readonly (readonly [string, string])[] = [
  ['01', 'What the dish costs you, and what it should sell for.'],
  ['02', 'A short list of prices to confirm each morning.'],
  ['03', 'A note when a rate moves and a dish stops making money.'],
];

export function DashboardEmpty({ target }: { target: number }) {
  return (
    <div className="fd fd-empty">
      <div className="fd-lead">
        <h1 className="fd-h">Cost one dish, and this page starts working.</h1>
        <p className="fd-lede">
          Pick something you make often. You&rsquo;ll list what goes into it, we&rsquo;ll price it
          from your rates, and from then on it recosts itself whenever one of those rates changes.
        </p>
        <div className="fd-act">
          <Link href="/recipes?new=1" className="btn btn-primary fd-btn">Cost your first dish</Link>
          <span className="fd-act-said">
            Ten minutes for the first one, because you&rsquo;re teaching us your ingredients as you
            go. The second takes two.
          </span>
        </div>
        <p className="fd-other">
          Changed your mind?{' '}
          <Link href="/import">Bring the whole menu in from your spreadsheet</Link> instead.
        </p>
      </div>

      <section className="fd-lands">
        <h2 className="fd-h2">What lands here once you have</h2>
        {LANDS.map(([n, said]) => (
          <div className="fd-land" key={n}>
            <span className="figure fd-land-n">{n}</span>
            <p>{said}</p>
          </div>
        ))}
        <p className="fd-settled">
          Your currency, tax and <span className="figure">{target}%</span> target are already set
          from setup. Nothing else needs configuring.
        </p>
      </section>
    </div>
  );
}

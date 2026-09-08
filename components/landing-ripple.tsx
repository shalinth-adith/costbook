/**
 * The ripple — the one thing on the entry screen that moves.
 *
 * A rate changes on the left, and the change runs along every line it can
 * reach: through three bases somebody else made, out to seven dishes on the
 * right, which reprice as it arrives. That is the product's entire claim
 * drawn as a picture rather than said as a sentence, and it is the thing a
 * spreadsheet cannot do — a sheet knows which dishes list onion; it does not
 * know which dishes reach it through a sofrito.
 *
 * Everything here is server-rendered SVG driven by one CSS clock. There is no
 * JavaScript timer, no state, and no library: every element carries a 14s
 * animation and its keyframes say when its moment comes. The sequence:
 *
 *   draw the lines · the rate flips · a pulse runs to the bases · a pulse runs
 *   to the dishes · the dishes reprice · hold · settle back · again.
 *
 * It loops, which the rest of the product would never do. This is the entry
 * screen and it is allowed to be theatre — the owner asked for motion at any
 * cost, and a picture of a rate moving that only moves once is a picture of a
 * rate that moved once. The rest holds long enough to read.
 *
 * Reduced motion gets the finished state, still: the static CSS *is* the
 * after-state, and the keyframes only ever reach backwards from it.
 */

/** A base and the dishes that reach the onion through it. */
interface Base {
  readonly name: string;
  readonly dishes: readonly Dish[];
}
interface Dish {
  readonly name: string;
  readonly was: string;
  readonly now: string;
  /** Crosses the 32% target when the rate moves. */
  readonly crosses: boolean;
}

/*
 * Four kitchens, deliberately. A single cuisine sells the product as being for
 * that cuisine; the arithmetic is the same wherever the plate comes from.
 */
const BASES: readonly Base[] = [
  {
    name: "Tomato Sofrito",
    dishes: [
      { name: "Shakshuka", was: "31.2", now: "33.6", crosses: true },
      { name: "Huevos Rancheros", was: "27.4", now: "29.0", crosses: false },
      { name: "Lamb Tagine", was: "38.9", now: "41.9", crosses: false },
    ],
  },
  {
    name: "Curry Base",
    dishes: [
      { name: "Chicken Katsu Curry", was: "31.6", now: "32.4", crosses: true },
      { name: "Vegetable Korma", was: "24.1", now: "25.7", crosses: false },
    ],
  },
  {
    name: "Rendang Paste",
    dishes: [
      { name: "Beef Rendang", was: "31.0", now: "33.1", crosses: true },
      { name: "Rendang Fried Rice", was: "22.8", now: "24.2", crosses: false },
    ],
  },
];

/* ── the geometry, computed rather than placed ────────────────────────── */

const W = 720;
const H = 520;

const ROOT = { x: 16, y: H / 2, w: 168, h: 66 };
const BASE = { x: 282, w: 142, h: 46 };
const DISH = { x: 500, w: 208, h: 40 };

const dishes = BASES.flatMap((b) => b.dishes);
const dishGap = (H - 40) / dishes.length;
const dishY = (i: number): number => 20 + dishGap * i + dishGap / 2;

/** A base sits level with the middle of its own dishes. */
function baseY(bi: number): number {
  const first = BASES.slice(0, bi).reduce((n, b) => n + b.dishes.length, 0);
  const last = first + BASES[bi]!.dishes.length - 1;
  return (dishY(first) + dishY(last)) / 2;
}

/** A soft S-curve from the right edge of one box to the left of the next. */
function link(x1: number, y1: number, x2: number, y2: number): string {
  const c = (x2 - x1) * 0.55;
  return `M${x1} ${y1} C${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
}

export function LandingRipple() {
  let di = 0;

  return (
    <figure className="lp-ripple" aria-labelledby="lp-ripple-said">
      <svg
        className="lp-rp"
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        aria-hidden="true"
        focusable="false"
      >
        {/* ── lines, drawn first so the boxes sit on them ──────────── */}
        <g className="lp-rp-edges">
          {BASES.map((b, bi) => {
            const y = baseY(bi);
            const toBase = link(ROOT.x + ROOT.w, ROOT.y, BASE.x, y);
            return (
              <g key={b.name}>
                <path className="lp-rp-edge is-a" d={toBase} pathLength={1} />
                <path className="lp-rp-glow is-a" d={toBase} pathLength={1} />
                <path className="lp-rp-comet is-a" d={toBase} pathLength={1} />
                {b.dishes.map((d, k) => {
                  const dy = dishY(
                    BASES.slice(0, bi).reduce(
                      (n, x) => n + x.dishes.length,
                      0,
                    ) + k,
                  );
                  const toDish = link(BASE.x + BASE.w, y, DISH.x, dy);
                  return (
                    <g key={d.name}>
                      <path
                        className="lp-rp-edge is-b"
                        d={toDish}
                        pathLength={1}
                      />
                      <path
                        className="lp-rp-glow is-b"
                        d={toDish}
                        pathLength={1}
                      />
                      <path
                        className="lp-rp-comet is-b"
                        d={toDish}
                        pathLength={1}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </g>

        {/* ── the ingredient ───────────────────────────────────────── */}
        <g
          transform={`translate(${String(ROOT.x)} ${String(ROOT.y - ROOT.h / 2)})`}
        >
          <g className="lp-rp-node is-root">
            <rect className="lp-rp-box" width={ROOT.w} height={ROOT.h} rx={8} />
            <text className="lp-rp-label" x={16} y={24}>
              Onion, large
            </text>
            <text className="lp-rp-fig lp-rp-was" x={16} y={50}>
              42.00
            </text>
            <text className="lp-rp-fig lp-rp-now" x={16} y={50}>
              60.00
            </text>
            <text
              className="lp-rp-unit"
              x={ROOT.w - 14}
              y={50}
              textAnchor="end"
            >
              a kilo
            </text>
          </g>
        </g>

        {/* ── the bases ────────────────────────────────────────────── */}
        {BASES.map((b, bi) => {
          const y = baseY(bi);
          return (
            <g
              key={b.name}
              transform={`translate(${String(BASE.x)} ${String(y - BASE.h / 2)})`}
            >
              <g
                className="lp-rp-node is-base"
                style={{ animationDelay: `${String(1000 + bi * 90)}ms` }}
              >
                <rect
                  className="lp-rp-box"
                  width={BASE.w}
                  height={BASE.h}
                  rx={7}
                />
                <circle className="lp-rp-dot" cx={0} cy={BASE.h / 2} r={3.5} />
                <text className="lp-rp-label" x={16} y={BASE.h / 2 + 5}>
                  {b.name}
                </text>
              </g>
            </g>
          );
        })}

        {/* ── the dishes ───────────────────────────────────────────── */}
        {BASES.map((b) =>
          b.dishes.map((d) => {
            const y = dishY(di);
            di += 1;
            return (
              <g
                key={d.name}
                transform={`translate(${String(DISH.x)} ${String(y - DISH.h / 2)})`}
              >
                <g
                  className={`lp-rp-node is-dish${d.crosses ? " is-crosses" : ""}`}
                  style={{ animationDelay: `${String(1500 + di * 60)}ms` }}
                >
                  <rect
                    className="lp-rp-box"
                    width={DISH.w}
                    height={DISH.h}
                    rx={6}
                  />
                  <circle
                    className="lp-rp-dot"
                    cx={0}
                    cy={DISH.h / 2}
                    r={3.5}
                  />
                  {d.crosses ? (
                    <circle
                      className="lp-rp-ring"
                      cx={0}
                      cy={DISH.h / 2}
                      r={4}
                    />
                  ) : null}
                  <text
                    className="lp-rp-label is-dish"
                    x={14}
                    y={DISH.h / 2 + 4.5}
                  >
                    {d.name}
                  </text>
                  <text
                    className="lp-rp-fig lp-rp-was"
                    x={DISH.w - 12}
                    y={DISH.h / 2 + 4.5}
                    textAnchor="end"
                  >
                    {d.was}%
                  </text>
                  <text
                    className="lp-rp-fig lp-rp-now"
                    x={DISH.w - 12}
                    y={DISH.h / 2 + 4.5}
                    textAnchor="end"
                  >
                    {d.now}%
                  </text>
                </g>
              </g>
            );
          }),
        )}
      </svg>

      {/*
        * On a phone the graph's labels would render at seven pixels. The
        * same story as a list instead: the rate, then every dish it reaches
        * with its base named — on the same clock, so it reprices when the
        * caption does.
        */}
      <ol className="lp-ripple-small" aria-hidden="true">
        <li className="lp-rps-root">
          <span className="lp-rps-name">Onion, large</span>
          <span className="figure lp-rps-fig">
            <span className="lp-rp-was">42.00</span>
            <span className="lp-rp-now">60.00</span>
            <span className="lp-rps-unit">a kilo</span>
          </span>
        </li>
        {BASES.flatMap((b) =>
          b.dishes.map((d) => (
            <li key={d.name} className={`lp-rps-dish${d.crosses ? " is-crosses" : ""}`}>
              <span className="lp-rps-name">
                {d.name}
                <span className="lp-rps-via">via {b.name}</span>
              </span>
              <span className="figure lp-rps-fig">
                <span className="lp-rp-was">{d.was}%</span>
                <span className="lp-rp-now">{d.now}%</span>
              </span>
            </li>
          )),
        )}
      </ol>

      {/* One caption, replaced rather than retyped, on the same clock. What
          a screen reader gets is the finished sentence, once. */}
      <figcaption
        className="lp-ripple-said"
        id="lp-ripple-said"
        aria-label="Onion moves from 42 to 60 a kilo: 11 dishes move, and 3 cross your target."
      >
        <span className="lp-rp-was" aria-hidden="true">
          Onion is in <b className="figure">11</b> of your dishes.
        </span>
        <span className="lp-rp-now" aria-hidden="true">
          <b className="figure">11</b> dishes move. <b className="figure">3</b> cross your target.
        </span>
      </figcaption>
    </figure>
  );
}

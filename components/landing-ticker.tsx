/**
 * The rate strip under the hero.
 *
 * A row of this week's moves, running slowly across the foot of the entry
 * screen. It is the sound of the product: prices do not sit still, and a
 * costing that was right on Monday is a guess by Friday. Nothing here is
 * interactive and nothing is a real supplier's price — it is the weather,
 * not the forecast.
 *
 * The list is rendered twice, end to end, so the loop has no seam: by the
 * time the first copy has scrolled out, the second is exactly where the first
 * began. Pausing on hover lets somebody actually read one.
 */

interface Move {
  readonly name: string;
  readonly was: string;
  readonly now: string;
  readonly unit: string;
}

const MOVES: readonly Move[] = [
  { name: "Onion, large", was: "42", now: "60", unit: "kg" },
  { name: "Tomato", was: "18", now: "21", unit: "kg" },
  { name: "Butter, unsalted", was: "480", now: "465", unit: "kg" },
  { name: "Chicken thigh", was: "290", now: "310", unit: "kg" },
  { name: "Coconut milk", was: "95", now: "95", unit: "L" },
  { name: "Coriander", was: "120", now: "160", unit: "kg" },
  { name: "Eggs", was: "6.5", now: "7.2", unit: "each" },
  { name: "Sunflower oil", was: "138", now: "131", unit: "L" },
  { name: "Basmati", was: "96", now: "96", unit: "kg" },
  { name: "Lamb shoulder", was: "640", now: "690", unit: "kg" },
  { name: "Paneer", was: "380", now: "372", unit: "kg" },
  { name: "Garlic", was: "160", now: "215", unit: "kg" },
];

function tone(m: Move): "up" | "down" | "flat" {
  const a = Number(m.was);
  const b = Number(m.now);
  return b > a ? "up" : b < a ? "down" : "flat";
}

function share(m: Move): string {
  const a = Number(m.was);
  const b = Number(m.now);
  if (a === b) return "—";
  const pct = Math.round(((b - a) / a) * 100);
  return `${pct > 0 ? "+" : ""}${String(pct)}%`;
}

function Row({ hidden }: { hidden: boolean }) {
  return (
    <ul className="lp-tick-row" aria-hidden={hidden ? true : undefined}>
      {MOVES.map((m) => (
        <li key={m.name} className={`lp-tick is-${tone(m)}`}>
          <span className="lp-tick-name">{m.name}</span>
          <span className="figure lp-tick-move">
            <span className="lp-tick-was">{m.was}</span>
            <span className="lp-tick-arrow" aria-hidden="true">
              →
            </span>
            <span className="lp-tick-now">{m.now}</span>
            <span className="lp-tick-unit">/{m.unit}</span>
          </span>
          <span className="figure lp-tick-share">{share(m)}</span>
        </li>
      ))}
    </ul>
  );
}

export function LandingTicker() {
  return (
    <div className="lp-ticker" aria-label="Rates that moved this week">
      <span className="lp-ticker-tag figure">This week</span>
      <div className="lp-ticker-track">
        <div className="lp-ticker-run">
          <Row hidden={false} />
          <Row hidden />
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * A ledger: rows of name-and-figure, the way a kitchen's own book is ruled.
 *
 * The first shared piece of the redraw. A list of dishes, rates or moves is
 * not a stack of cards — it is rows: the name left, a line under it saying
 * what it is, the figure right in mono, and a coloured edge for standing.
 * Colour is state and nothing else: orange-brown for losing, amber for
 * watch, green for earning, grey for "needs you". Every list on the
 * dashboard is built from this, so they read the same and sit together.
 */

export type Tone = "on" | "near" | "over" | "quiet" | "none";

export function Ledger({
  label,
  count,
  children,
  index = 0,
}: {
  /** A mono eyebrow over the rows. */
  label: string;
  /** How many there really are, beside the label. */
  count?: number | undefined;
  children: React.ReactNode;
  /** Arrival order on the page. */
  index?: number;
}) {
  return (
    <section className="lg" style={{ "--i": index } as CSSProperties}>
      <p className="lg-label">
        {label}
        {count !== undefined && count > 0 ? (
          <b className="lg-count figure">{count}</b>
        ) : null}
      </p>
      {children}
    </section>
  );
}

export function LedgerRow({
  href,
  name,
  sub,
  fig,
  tone = "none",
  figTone,
}: {
  href?: string | undefined;
  name: React.ReactNode;
  /** One line under the name. Never a sentence with a full stop. */
  sub?: React.ReactNode;
  /** The figure on the right. */
  fig?: React.ReactNode;
  /** The edge. */
  tone?: Tone;
  /** The figure's ink, when it should differ from the edge. */
  figTone?: Tone | undefined;
}) {
  const inner = (
    <>
      <span className="lg-said">
        <span className="lg-name">{name}</span>
        {sub !== undefined && sub !== null ? (
          <span className="lg-sub">{sub}</span>
        ) : null}
      </span>
      {fig !== undefined && fig !== null ? (
        <span
          className={`lg-fig figure${figTone !== undefined ? ` is-${figTone}` : ""}`}
        >
          {fig}
        </span>
      ) : null}
    </>
  );
  const cls = `lg-row is-${tone}`;
  return href === undefined ? (
    <div className={cls}>{inner}</div>
  ) : (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

/** One quiet line where a ledger would otherwise be empty. */
export function LedgerEmpty({ children }: { children: React.ReactNode }) {
  return <p className="lg-empty">{children}</p>;
}

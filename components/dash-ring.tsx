"use client";

import { useEffect, useState } from "react";

/**
 * A ring that draws itself to a share of the whole.
 *
 * The headline figure — what the kitchen keeps out of every 100 taken — is a
 * share, and a share drawn as an arc against the full circle is read before
 * the number beside it is. The second, fainter arc is the target, so the two
 * can be compared without either being labelled.
 *
 * It draws on arrival: the arc grows from nothing to its length over most of
 * a second. That is the one place on the page motion carries meaning rather
 * than decoration — the eye follows the arc to where it stops, and where it
 * stops is the figure.
 */
export function Ring({
  share,
  target,
  size = 148,
  stroke = 11,
  ink,
}: {
  /** 0–100. What is kept. */
  share: number;
  /** 0–100. What was planned. Drawn faint, underneath. */
  target: number;
  size?: number;
  stroke?: number;
  ink: "on" | "near" | "over";
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [drawn, setDrawn] = useState(0);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      setDrawn(share);
      return undefined;
    }
    // A frame after mount, so the transition has a start state to leave from.
    const t = requestAnimationFrame(() => {
      setDrawn(share);
    });
    return () => {
      cancelAnimationFrame(t);
    };
  }, [share]);

  const arc = (pct: number) => c - (Math.max(0, Math.min(100, pct)) / 100) * c;

  return (
    <svg
      className="ring"
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      role="img"
      aria-label={`${String(Math.round(share))} of every 100 kept, against ${String(Math.round(target))} planned`}
    >
      <circle
        className="ring-track"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
      />
      <circle
        className="ring-target"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={arc(target)}
      />
      <circle
        className={`ring-arc ink-${ink}`}
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={arc(drawn)}
      />
    </svg>
  );
}

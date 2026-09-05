"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that is seen arriving, and seen changing.
 *
 * `CountUp` on the dashboard counts whole numbers up from zero once. This is
 * the money version, and it does one more thing that matters on a cost sheet:
 * when a figure changes it counts from what it was, not from zero. Editing a
 * line and watching the batch total travel from 51.66 to 153.66 says
 * something true — that this edit did that. Resetting to zero first would
 * say only that something happened.
 *
 * Motion here is not decoration. Every figure on these screens is the
 * argument the product is making, and a figure that moves is the one to read.
 *
 * Rounded to the money's own precision before comparing, so a tween never
 * ends on a value that renders differently from the one it was given.
 */
export function Ticker({
  value,
  format,
  duration,
  className,
}: {
  value: number;
  /** How the figure is written. Called on every frame, so keep it cheap. */
  format: (value: number) => string;
  /** Milliseconds. Arrival is longer than a change, because it travels further. */
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  /*
   * The last value this instance drew, so a change counts from it.
   *
   * Starts at zero, which makes the first run an arrival. On React's
   * development double-mount it starts at zero again and the arrival simply
   * replays — harmless, and deliberately not guarded against: the guard is
   * what once left every figure on the dashboard sitting at zero, because
   * the first pass set it and the cleanup cancelled the frame it scheduled.
   */
  const from = useRef(0);

  useEffect(() => {
    const start = from.current;
    from.current = value;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    /*
     * A hidden tab counts as "cannot animate", not as "animate later".
     *
     * Frame callbacks do not fire while the document is hidden, so a tween
     * started there never advances and the figure sits at whatever it last
     * drew — a stale number, presented as a current one, which is the one
     * thing a costing screen must never do. Jump straight to the value; the
     * arrival is worth nothing to somebody who is not looking.
     */
    if (still || start === value || !Number.isFinite(value) || document.hidden) {
      setShown(value);
      return undefined;
    }

    const span = duration ?? (start === 0 ? 560 : 380);
    const began = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - began) / span, 1);
      // Ease out: most of the distance early, then settling. A linear count
      // reads as a spinner rather than as a figure arriving at a value.
      const eased = 1 - (1 - t) ** 3;
      setShown(start + (value - start) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else setShown(value);
    };

    frame = requestAnimationFrame(tick);
    // Whatever happens to the frames, the figure ends up correct. A tween
    // that stalls must not leave the wrong number on screen.
    const settle = setTimeout(() => { setShown(value); }, span + 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [value, duration]);

  return <span className={className}>{format(shown)}</span>;
}

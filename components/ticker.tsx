"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A figure that shows it has changed, without animating its value.
 *
 * This counted. It was built to count — watching a batch total travel from
 * 51.66 to 204.66 says "this edit did that" — and it broke a rule this
 * project wrote down long before I arrived:
 *
 *   FLOWS.md, rules that apply to every screen:  "A figure never animates
 *   its value."
 *
 *   FLOWS.md §6, on the rate-change panel, which is the product's centre:
 *   "the numbers appear at their new values immediately and never count up".
 *
 * The rule is better than the idea it overruled. Every figure on these
 * screens is the argument the product is making, and a figure mid-count is
 * a figure that cannot be read, compared or trusted at a glance. On a screen
 * an owner is using to decide a price, a number that is briefly wrong on
 * purpose is worse than no motion at all.
 *
 * So the value appears immediately, and the change is marked the way the
 * same document prescribes for the impact panel: a brief tint, held and then
 * fading. The eye is drawn to what moved; the figure is readable throughout.
 */
export function Ticker({
  value,
  format,
  className,
}: {
  value: number;
  format: (value: number) => string;
  className?: string;
}) {
  const [changed, setChanged] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return undefined;
    previous.current = value;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined;

    setChanged(true);
    // Held about a second, then fading, per the same rule.
    const done = setTimeout(() => {
      setChanged(false);
    }, 1000);
    return () => {
      clearTimeout(done);
    };
  }, [value]);

  return (
    <span
      className={`${className ?? ""}${changed ? " is-changed" : ""}`.trim()}
    >
      {format(value)}
    </span>
  );
}

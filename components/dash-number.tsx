"use client";

import { useEffect, useState } from "react";

/**
 * A figure. It does not count.
 *
 * This animated from zero to its value on the dashboard's headline and on
 * every door card, and it was the best-looking thing on the screen. It broke
 * the rule this project wrote down for every screen it has:
 *
 *   FLOWS.md:  "A figure never animates its value."
 *
 * The rule is right, and the dashboard is where it is most right. This is the
 * first screen an owner opens and the figure in the ring is the answer to the
 * only question they came with — what am I keeping. A figure that spends most
 * of a second being other numbers first is a figure they cannot read, cannot
 * compare against the one they remember from yesterday, and have no reason to
 * trust. The motion was ours; the number is theirs.
 *
 * Kept as a component rather than deleted so the call sites keep reading as
 * "this is a figure", and so nobody re-adds the counting by hand.
 */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
}: {
  to: number;
  /** Accepted and ignored. Here so the old call sites keep type-checking. */
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <>
      {prefix}
      {to.toLocaleString()}
      {suffix}
    </>
  );
}

export function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => {
      clearInterval(t);
    };
  }, []);

  if (now === null) return <span className="dh-clock" aria-hidden="true" />;

  return (
    <span className="dh-clock">
      <span className="dh-day">
        {now.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </span>
      <span className="dh-time figure">
        {now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </span>
  );
}

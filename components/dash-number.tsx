"use client";

import { useEffect, useState } from "react";

/**
 * A figure that counts up to itself once, on arrival.
 *
 * Motion earns its place here for one reason: it draws the eye to the figure
 * rather than to the card around it, and on a screen whose whole job is to
 * report numbers that is the right thing to draw the eye to. It runs once, on
 * mount, and never again — a number that re-animates every time something
 * elsewhere re-renders is a number nobody can read.
 *
 * `prefers-reduced-motion` gets the final value immediately. Not a shorter
 * animation: somebody who has asked for no motion has asked for no motion, and
 * a counter is exactly the kind of movement that setting exists for.
 */
export function CountUp({
  to,
  duration = 620,
  prefix = "",
}: {
  to: number;
  duration?: number;
  prefix?: string;
}) {
  const [shown, setShown] = useState(to);

  /*
   * No "have I already run" ref here, and that is deliberate.
   *
   * The first version guarded with one. In development React mounts, cleans
   * up, and mounts again: the first pass set the guard and scheduled a frame,
   * the cleanup cancelled the frame, and the second pass saw the guard and
   * returned immediately — so the animation never ran and every figure on the
   * screen sat at zero. A dashboard reporting 0 recipes and 0 earning well,
   * confidently, because of an animation.
   *
   * Re-running is harmless: `to` changes only when the data does, and the
   * cleanup cancels any frame still in flight.
   */
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || to === 0) {
      setShown(to);
      return undefined;
    }

    setShown(0);
    const from = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - from) / duration, 1);
      // Ease out: fast to most of the value, then settles. A linear count
      // reads as a loading spinner rather than as a figure arriving.
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(to * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [to, duration]);

  return (
    <>
      {prefix}
      {shown}
    </>
  );
}

/**
 * The date and time, from the browser rather than the server.
 *
 * Rendered empty on the server and filled after mount. A clock rendered on the
 * server is wrong by the time it arrives, and worse, it is wrong in a way that
 * makes React replace the markup on hydration — which is a visible flicker on
 * the first thing the eye lands on.
 */
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

/**
 * What a rate's history says about it.
 *
 * Read by the ingredient drawer, which shows the moves, and by the kitchen
 * screen's selection rule, which ranks on two of these figures. Pure functions
 * over records the store already holds — nothing here reaches for a database.
 *
 * The distinction that matters throughout: a confirmation is real work and
 * belongs in the history, and it is not a movement. An ingredient checked
 * every Monday and unchanged since March has twelve records and no volatility,
 * and treating those records as moves would put it at the top of a list it has
 * no business being on.
 */

import { type RateChange, isMovement } from './org';

/** Moves only. What the drawer shows and what "moved 4 times" counts. */
export function movements(history: readonly RateChange[]): readonly RateChange[] {
  return history.filter(isMovement);
}

/** How many times the figure actually changed within the window. */
export function movementCount(history: readonly RateChange[], since?: string): number {
  return movements(history).filter((h) => since === undefined || h.on >= since).length;
}

/**
 * Days since anyone last looked at this rate — changed it or confirmed it.
 *
 * A39's tie-breaker, and the only one of its three factors that grows on its
 * own. Null when the rate has never been touched at all, which is a different
 * thing from having been checked a long time ago.
 */
export function daysSinceConfirmed(
  history: readonly RateChange[],
  today: string,
): number | null {
  const last = history[0];
  if (last === undefined) return null;
  const then = Date.parse(last.on);
  const now = Date.parse(today);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

/** The date of the last look, whether it moved the figure or not. */
export function lastTouched(history: readonly RateChange[]): string | null {
  return history[0]?.on ?? null;
}

/**
 * How far the rate has travelled, as a share of where it started.
 *
 * A39 ranks partly on "how much it has moved before" — an ingredient that has
 * been steady since March earns no place, however old the figure is. Measured
 * as total absolute movement over the earliest rate on file, so a rate that
 * went 40 → 60 → 40 counts as having moved, which it did, twice.
 */
export function volatility(history: readonly RateChange[]): number {
  const moves = movements(history);
  if (moves.length === 0) return 0;

  const earliest = moves[moves.length - 1];
  const base = earliest?.from ?? earliest?.to ?? 0;
  if (base <= 0) return 0;

  const travelled = moves.reduce((sum, m) => sum + Math.abs(m.to - (m.from ?? m.to)), 0);
  return travelled / base;
}

/** The most recent figure the history knows about, or null. */
export function latestRate(history: readonly RateChange[]): number | null {
  return history[0]?.to ?? null;
}

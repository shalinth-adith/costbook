/**
 * Display formatting. The only place rounding happens (TRD 4) — every figure
 * upstream of this is held at full precision.
 */

/** A figure that is absent reads as a dash, never as a zero. */
export const DASH = '—';

export function money(value: number | null | undefined, places = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/** Rates run to more places than money: a per-gram figure rounded to 2dp is 0.00. */
export function rate(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return value >= 1 ? money(value, 2) : money(value, 4);
}

export function percent(value: number | null | undefined, places = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(places)}%`;
}

/** Quantities keep whatever precision they were entered with, up to 2 places. */
export function qty(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export function points(value: number, places = 1): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(places)}`;
}

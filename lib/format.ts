import { fromBase } from '@/core/units';

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

/**
 * What one batch yields, in the unit the operator typed.
 *
 * outputQty is stored in base units — 2500 for 2.5 kg — because every quantity
 * in the system is (TRD 3). Printing it raw beside the display unit reads as
 * "2500 kg", which is wrong by a factor of a thousand and looks like a typo
 * rather than a unit error.
 */
export function outputText(baseQty: number, unit: string): string {
  const shown = fromBase(baseQty, unit);
  return `${qty(shown)} ${unit}`;
}

export function points(value: number, places = 1): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(places)}`;
}

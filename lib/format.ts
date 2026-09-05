import { formatMoney, formatRate } from '@/core/currency';
import { ratePerUnit } from '@/core/ingredient';
import { fromBase } from '@/core/units';

/**
 * Display formatting. The only place rounding happens (TRD 4) — every figure
 * upstream of this is held at full precision.
 */

/** A figure that is absent reads as a dash, never as a zero. */
export const DASH = '—';

/**
 * A figure, in the account's currency.
 *
 * The symbol is left to the caller so it can sit in its own span with a fixed
 * inline gap, which is what keeps a column aligned on the decimal whatever
 * side the symbol is on (A1).
 */
export function money(
  value: number | null | undefined,
  code = 'INR',
  places?: number,
): string {
  return formatMoney(
    value,
    code,
    places === undefined ? { withSymbol: false } : { withSymbol: false, decimals: places },
  );
}

/** Rates run to more places than money: a per-gram figure at 2dp is 0.00. */
export function rate(value: number | null | undefined, code = 'INR'): string {
  return formatRate(value, code);
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

/**
 * A component line's quantity, in the unit beside it.
 *
 * Every quantity in the system is stored in base units (TRD 3), so a line of
 * 1 kg is held as 1000. Printing that raw next to its display unit says
 * "1000 kg" — a batch of rice a thousand times heavier than the one the
 * operator typed, and the reason a plate of jeera rice read as 23,000.
 *
 * Note the inversion, which is the same one `ratePerUnit` documents from the
 * other side. A quantity converts *out* of base by dividing: 1000 g is 1 kg.
 * A rate converts by multiplying: 0.023 per g is 23 per kg.
 */
export function lineQty(baseQty: number, unit: string): string {
  if (unit === '') return qty(baseQty);
  try {
    return qty(fromBase(baseQty, unit));
  } catch {
    // An unknown unit is not convertible, so the figure is left as it stands
    // rather than shown through a conversion that does not exist.
    return qty(baseQty);
  }
}

/** A line's rate, expressed per the unit shown beside it rather than per base. */
export function lineRate(ratePerBaseUnit: number | null, unit: string): number | null {
  if (ratePerBaseUnit === null || unit === '') return ratePerBaseUnit;
  try {
    return ratePerUnit(ratePerBaseUnit, unit);
  } catch {
    return ratePerBaseUnit;
  }
}


/**
 * When a rate was last given, in the words a kitchen uses (A19).
 *
 * "3 days ago" rather than "2026-08-14". An absolute date makes the reader do
 * the arithmetic, and the question this column answers is how old the figure
 * is, not what the calendar said when it was typed.
 */
export function ago(days: number | null): string {
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? 'a year ago' : `${years} years ago`;
}


/**
 * A timestamp as a person reads it (A19's rule, applied to the library).
 *
 * The library printed "2026-08-31T13:47:27.325+00" and wrapped it across two
 * lines. Nobody reads a timestamp to learn the millisecond; they read it to
 * learn whether the figure beside it is old.
 */
export function when(iso: string | null, today: string): string {
  if (iso === null) return DASH;
  const then = iso.slice(0, 10);
  const days = Math.round((Date.parse(today) - Date.parse(then)) / 86_400_000);
  if (Number.isNaN(days)) return then;
  return ago(Math.max(0, days));
}

/**
 * A quantity, in the unit it was written in.
 *
 * This used to convert by magnitude: anything under a kilo was shown in
 * grams, anything under a litre in millilitres. The intention was kindness —
 * "0.03 l of ghee is 30 ml to anyone who has poured it" — and the effect was
 * that the product overruled the operator. Type 0.8 kg of rice and it came
 * back as 800 g; type 1500 g and it came back as 1.5 kg. Neither is wrong
 * arithmetic and both are the wrong words: a sheet that says 0.8 kg says it
 * because that is how that kitchen buys and counts rice, and a costing tool
 * that quietly restates a kitchen's own figures is a tool they check twice.
 *
 * So grams stay grams and kilos stay kilos. The place to spare somebody a
 * fiddly figure is the moment they type it, not afterwards.
 */
export function shownQty(baseQty: number, unit: string): { readonly qty: string; readonly unit: string } {
  return { qty: lineQty(baseQty, unit), unit };
}

/**
 * The unit a rate is said per: a kilo for anything weighed, a litre for
 * anything poured, the piece for anything counted. A line measured in
 * grams still carries a rate per kilo — 0.0044 a gram is a figure nobody
 * buys by, and a real sheet writes 4.40 a kilo beside a 70 g line.
 */
export function rateUnitOf(unit: string): string {
  if (unit === 'g' || unit === 'kg') return 'kg';
  if (unit === 'ml' || unit === 'l') return 'l';
  return unit;
}

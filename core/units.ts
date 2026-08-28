/**
 * Unit conversion, alias normalisation and family rules.
 *
 * Three families. Conversion is allowed within a family and never across it —
 * millilitres of oil to grams needs a density, and guessing one silently
 * misprices a dish. Cross-family use is rejected loudly instead (TRD 3).
 *
 * Every quantity in the system is stored converted to its family's base unit;
 * the unit the user typed is kept for display only. The reference workbook
 * showed what happens without that rule: "10 g of salt" read as 10 kg.
 *
 * Unknown tokens resolve to null rather than to a guess. Real sheets contain
 * `as req`, `lot`, `pinch`, `pkt` and `box`, which are costs with a label
 * rather than measurements; they become flat component lines (TRD 3.1). A
 * wrong guess here would poison every file the user imports afterwards.
 */

export type UnitFamily = 'mass' | 'volume' | 'count';

export interface UnitDefinition {
  /** The canonical spelling this token normalises to. */
  readonly canonical: string;
  readonly family: UnitFamily;
  /** Multiply by this to reach the family's base unit. */
  readonly factor: number;
}

/** The unit every quantity in a family is stored in. */
export const BASE_UNIT: Readonly<Record<UnitFamily, string>> = {
  mass: 'g',
  volume: 'ml',
  count: 'nos',
};

/**
 * Volume factors are US customary, following the TRD's own table: a cup at
 * 236.588 ml is the US cup, not the 250 ml metric one, so tsp, tbsp and
 * fl oz take their US values for consistency. A sheet that means the metric
 * cup will be out by 5.4%; that is a mapping question for the importer, not
 * something to fudge here.
 */
const UNITS: readonly UnitDefinition[] = [
  { canonical: 'g', family: 'mass', factor: 1 },
  { canonical: 'kg', family: 'mass', factor: 1000 },
  { canonical: 'mg', family: 'mass', factor: 0.001 },
  { canonical: 'lb', family: 'mass', factor: 453.592 },
  { canonical: 'oz', family: 'mass', factor: 28.3495 },

  { canonical: 'ml', family: 'volume', factor: 1 },
  { canonical: 'l', family: 'volume', factor: 1000 },
  { canonical: 'tsp', family: 'volume', factor: 4.92892 },
  { canonical: 'tbsp', family: 'volume', factor: 14.7868 },
  { canonical: 'cup', family: 'volume', factor: 236.588 },
  { canonical: 'fl oz', family: 'volume', factor: 29.5735 },

  { canonical: 'nos', family: 'count', factor: 1 },
  { canonical: 'pcs', family: 'count', factor: 1 },
];

const BY_CANONICAL: ReadonlyMap<string, UnitDefinition> = new Map(
  UNITS.map((u) => [u.canonical, u]),
);

/**
 * Spelling variants seen in real sheets. Deliberately conservative: only
 * variants that cannot mean anything else. Anything absent stays unknown and
 * becomes a flat line, which is recoverable; a wrong alias is not.
 */
const ALIASES: Readonly<Record<string, string>> = {
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  lbs: 'lb',
  mls: 'ml',
  ltr: 'l',
  ltrs: 'l',
  litre: 'l',
  litres: 'l',
  liter: 'l',
  liters: 'l',
  tsps: 'tsp',
  tbsps: 'tbsp',
  cups: 'cup',
  floz: 'fl oz',
  flozs: 'fl oz',
  no: 'nos',
  pc: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  each: 'pcs',
  unit: 'pcs',
  units: 'pcs',
};

export type UnitErrorCode = 'unknown_unit' | 'cross_family' | 'invalid_quantity';

/**
 * Carries structured detail so the interface can render plain language. The
 * user must never be shown a raw engine message (TRD 6.5).
 */
export class UnitError extends Error {
  readonly code: UnitErrorCode;
  readonly units: readonly string[];

  constructor(code: UnitErrorCode, message: string, units: readonly string[] = []) {
    super(message);
    this.name = 'UnitError';
    this.code = code;
    this.units = units;
  }
}

/**
 * Lowercase, drop periods, collapse whitespace. This is what makes `L` and `l`
 * the same litre, and `Fl. Oz.` the same fluid ounce, before any lookup runs.
 */
function canonicaliseToken(raw: string): string {
  return raw.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

/** The canonical spelling of a unit token, or null if it is not a unit. */
export function normaliseUnit(raw: string): string | null {
  return resolveUnit(raw)?.canonical ?? null;
}

/** Full definition of a unit token, or null if it is not a unit. */
export function resolveUnit(raw: string): UnitDefinition | null {
  const token = canonicaliseToken(raw);
  if (token === '') return null;

  const direct = BY_CANONICAL.get(token);
  if (direct !== undefined) return direct;

  const aliased = ALIASES[token];
  if (aliased === undefined) return null;

  return BY_CANONICAL.get(aliased) ?? null;
}

/** Which family a unit token belongs to, or null if it is not a unit. */
export function unitFamily(raw: string): UnitFamily | null {
  return resolveUnit(raw)?.family ?? null;
}

export function isKnownUnit(raw: string): boolean {
  return resolveUnit(raw) !== null;
}

/** Whether two unit tokens can be converted between. Unknown units are never convertible. */
export function sameFamily(a: string, b: string): boolean {
  const left = unitFamily(a);
  const right = unitFamily(b);
  return left !== null && left === right;
}

function requireUnit(raw: string): UnitDefinition {
  const unit = resolveUnit(raw);
  if (unit === null) {
    throw new UnitError('unknown_unit', `"${raw}" is not a unit we recognise.`, [raw]);
  }
  return unit;
}

function requireFiniteQty(qty: number): void {
  if (!Number.isFinite(qty)) {
    throw new UnitError('invalid_quantity', `${String(qty)} is not a usable quantity.`);
  }
}

/**
 * Convert a quantity into its family's base unit. Full precision, no rounding —
 * intermediate rounding is where the reference workbook's unexplained variances
 * came from (TRD 4).
 */
export function toBase(qty: number, unit: string): number {
  requireFiniteQty(qty);
  return qty * requireUnit(unit).factor;
}

/** Convert a base-unit quantity back into a display unit. */
export function fromBase(qty: number, unit: string): number {
  requireFiniteQty(qty);
  return qty / requireUnit(unit).factor;
}

/**
 * Convert between two units of the same family. Crossing families throws,
 * naming both units so the caller can say which line is wrong.
 */
export function convert(qty: number, from: string, to: string): number {
  requireFiniteQty(qty);
  const source = requireUnit(from);
  const target = requireUnit(to);

  if (source.family !== target.family) {
    throw new UnitError(
      'cross_family',
      `${source.canonical} measures ${source.family} and ${target.canonical} measures ` +
        `${target.family}. Converting between them needs a density, which Costbook does not hold.`,
      [source.canonical, target.canonical],
    );
  }

  return (qty * source.factor) / target.factor;
}

/**
 * Rounding rules for a suggested price.
 *
 * Purely presentational, and the first thing an operator notices
 * (COSTING_MODELS Axis F). Every rule here is a lattice of candidate prices —
 * multiples of five, whole rupees, figures ending in .99 — and a direction for
 * choosing between the two the value falls between.
 *
 * The default direction is up, and that is not an aesthetic choice. Rounding a
 * suggested price down silently erodes the target the operator just set: they
 * asked for a 32% food cost, and a price rounded down quietly delivers 32.4%.
 * Down is available because some operators want it, but it is never the
 * default and the interface says which is in force.
 *
 * Nothing here rounds an intermediate figure. A rate rounded mid-calculation
 * multiplies back out across a batch, and that is where the reference
 * workbook's unexplained variances came from (TRD 4).
 */

export type RoundingDirection = 'up' | 'down' | 'nearest';

/** How a value sitting exactly between two candidates resolves. */
export type TieBreak = 'up' | 'down' | 'even';

export type RoundingRule =
  /** The exact figure, at money precision. No candidate lattice at all. */
  | { readonly mode: 'none' }
  /** Whole units: 47.83 becomes 48. */
  | { readonly mode: 'whole'; readonly direction: RoundingDirection; readonly tie: TieBreak }
  /** Multiples of a step: nearest 5, nearest 10, nearest 0.5. */
  | {
      readonly mode: 'step';
      readonly step: number;
      readonly direction: RoundingDirection;
      readonly tie: TieBreak;
    }
  /**
   * Figures ending in a set amount: .99 and .95, and also whole figures
   * ending in 9 — 9, 19, 29, 39 — which is a different lattice with the same
   * shape. `every` is the spacing between candidates: 1 for a .99 price,
   * 10 for the next figure ending in 9.
   */
  | {
      readonly mode: 'charm';
      readonly ending: number;
      readonly every: number;
      readonly direction: RoundingDirection;
      readonly tie: TieBreak;
    };

export type RoundingErrorCode = 'invalid_step' | 'invalid_ending' | 'invalid_value';

export class RoundingError extends Error {
  readonly code: RoundingErrorCode;

  constructor(code: RoundingErrorCode, message: string) {
    super(message);
    this.name = 'RoundingError';
    this.code = code;
  }
}

/** Money precision. Two places is what every figure is displayed at. */
const MONEY_DP = 2;

/**
 * Everything is computed in millionths before any floor or ceiling runs.
 *
 * Without it, a value that is already a candidate gets rounded past itself:
 * 47.99 under a .99 rule leaves 47.00000000000001 after subtracting the
 * ending, and a ceiling on that returns 48.99. A whole rupee more, for a price
 * that was already correct.
 */
const SCALE = 1_000_000;

const toUnits = (value: number): number => Math.round(value * SCALE);
const fromUnits = (units: number): number => units / SCALE;

/** Convenience constructors, so a caller never assembles the union by hand. */
export const NONE: RoundingRule = { mode: 'none' };

export const whole = (direction: RoundingDirection = 'up', tie: TieBreak = 'up'): RoundingRule => ({
  mode: 'whole',
  direction,
  tie,
});

export const step = (
  size: number,
  direction: RoundingDirection = 'up',
  tie: TieBreak = 'up',
): RoundingRule => ({ mode: 'step', step: size, direction, tie });

export const charm = (
  ending: number,
  direction: RoundingDirection = 'up',
  tie: TieBreak = 'up',
  every = 1,
): RoundingRule => ({ mode: 'charm', ending, every, direction, tie });

/**
 * The rules named in COSTING_MODELS Axis F, ready to select.
 *
 * A preset says which shape of rule applies, never what a jurisdiction
 * charges — the same distinction that keeps the costing model honest.
 */
export const PRESETS = {
  none: NONE,
  nearest_whole: whole('nearest'),
  up_whole: whole('up'),
  /** The next whole figure ending in 9: 9, 19, 29, 39. */
  next_9: charm(9, 'up', 'up', 10),
  charm_99: charm(0.99),
  charm_95: charm(0.95),
  up_to_5: step(5),
  up_to_10: step(10),
  up_to_half: step(0.5),
  /**
   * Up to the next 0.10 — 2.56 becomes 2.60, 2.73 becomes 2.80.
   *
   * The default. It was `next_9`, which turned a 2.56 plate into 2.90 and
   * offered 3.00 as the alternative: two figures forty fils apart, neither
   * of them near the sum, on a screen whose reader had asked what to charge.
   * A rule is chosen once, in Settings, and applied everywhere; the sheet
   * shows one price and says which rule made it.
   */
  up_to_tenth: step(0.1),
} as const satisfies Readonly<Record<string, RoundingRule>>;

export type PresetName = keyof typeof PRESETS;

/**
 * The rule in the operator's words, for showing beside the figure it produced.
 *
 * Written out per case rather than assembled from fragments — composing
 * "round to the nearest" with "to a whole unit" gives "round to the nearest to
 * a whole unit", and a sentence a user reads is not the place to be clever.
 */
export function describeRule(rule: RoundingRule): string {
  switch (rule.mode) {
    case 'none':
      return 'leave the exact figure';

    case 'whole':
      switch (rule.direction) {
        case 'up':
          return 'round up to a whole unit';
        case 'down':
          return 'round down to a whole unit';
        case 'nearest':
          return 'round to the nearest whole unit';
      }
      break;

    case 'step':
      switch (rule.direction) {
        case 'up':
          return `round up to the nearest ${rule.step}`;
        case 'down':
          return `round down to the nearest ${rule.step}`;
        case 'nearest':
          return `round to the nearest ${rule.step}`;
      }
      break;

    case 'charm': {
      // A whole-number ending reads as "9", a fractional one as ".99".
      const ending = rule.every > 1 ? String(rule.ending) : rule.ending.toFixed(2).slice(1);
      switch (rule.direction) {
        case 'up':
          return `round up to the next figure ending in ${ending}`;
        case 'down':
          return `round down to the previous figure ending in ${ending}`;
        case 'nearest':
          return `round to the nearest figure ending in ${ending}`;
      }
    }
  }
}

interface Lattice {
  /** Spacing between candidates, in millionths. */
  readonly stepUnits: number;
  /** Where the lattice sits, in millionths. */
  readonly offsetUnits: number;
}

function latticeFor(rule: Exclude<RoundingRule, { mode: 'none' }>): Lattice {
  switch (rule.mode) {
    case 'whole':
      return { stepUnits: SCALE, offsetUnits: 0 };
    case 'step': {
      if (!Number.isFinite(rule.step) || rule.step <= 0) {
        throw new RoundingError('invalid_step', 'A rounding step has to be greater than zero.');
      }
      return { stepUnits: toUnits(rule.step), offsetUnits: 0 };
    }
    case 'charm': {
      if (!Number.isFinite(rule.every) || rule.every <= 0) {
        throw new RoundingError('invalid_step', 'A charm spacing has to be greater than zero.');
      }
      if (!Number.isFinite(rule.ending) || rule.ending < 0 || rule.ending >= rule.every) {
        throw new RoundingError(
          'invalid_ending',
          'A charm ending is what a price finishes on, so it sits below the spacing between them.',
        );
      }
      // 46.99, 47.99, 48.99 at a spacing of 1 — or 9, 19, 29 at a spacing of 10.
      return { stepUnits: toUnits(rule.every), offsetUnits: toUnits(rule.ending) };
    }
  }
}

/**
 * Bring a lattice down to the size of the figure it is rounding.
 *
 * "The next figure ending in 9" means 9, 19, 29 — a lattice built for menu
 * prices. Applied to a figure below its first rung it has no rung to offer and
 * snaps everything up to 9: a dish costing 0.26 was being suggested at 9.00, an
 * elevenfold jump, presented as confidently as any other price.
 *
 * The intent of the rule is charm pricing, and charm pricing at sub-unit
 * figures is 0.89 rather than 9. So the lattice divides by ten until it fits
 * under the figure, which preserves what the rule means at every magnitude.
 *
 * A step lattice has the same fault and it was left in when the charm one was
 * fixed. "Round up to the next 5" applied to 0.71 has no rung below 5, so it
 * offered 5.00 — a sevenfold markup, sitting beside a 0.79 as though the two
 * were comparable choices. Every dish on a menu priced under 5 got one real
 * candidate and one absurd one.
 *
 * A suggestion nobody would act on costs more trust than silence (A26).
 */
function scaleToFit<R extends RoundingRule>(rule: R, value: number): R {
  if (!Number.isFinite(value) || value <= 0) return rule;
  if (rule.mode === 'step') return scaleStep(rule, value) as R;
  if (rule.mode !== 'charm') return rule;

  /*
   * Only a whole-number lattice scales, and only until it stops being one.
   *
   * An ending of 9 says "just under the next ten" — a menu-price rule. An
   * ending of 0.99 or 0.95 is already a sub-unit rule and means exactly what it
   * says at any size, so it is left alone: charm_99 on a 0.50 figure should
   * give 0.99, not 0.099.
   */
  // Whether this was a whole-number lattice to begin with. An ending of 9 says
  // "just under the next ten" and scales; an ending of 0.99 is already a
  // sub-unit rule and means what it says at any size.
  if (rule.ending < 1) return rule;

  let { every, ending } = rule;
  // Down to a hundredth and no further: money has two places, and a lattice
  // finer than the currency's own precision rounds to figures it cannot print.
  while (value < ending && ending > 0.01) {
    every /= 10;
    ending /= 10;
  }

  return every === rule.every ? rule : { ...rule, every, ending };
}

/**
 * The same descent for a step lattice.
 *
 * Every step scales, including the sub-unit ones — unlike charm, where an
 * ending of 0.99 is about the trailing digits and means the same thing at any
 * size. A step is a magnitude, so "round up to the next half" has exactly the
 * fault on a 0.03 figure that "the next 5" has on a 0.71 one: it was returning
 * 0.50, sixteen times the figure.
 */
function scaleStep(rule: Extract<RoundingRule, { mode: 'step' }>, value: number) {
  let { step } = rule;
  // Never below a hundredth: a lattice finer than the currency's own precision
  // rounds to figures it cannot print. Checked before dividing, so the step
  // lands on 0.01 rather than stepping through it to 0.001.
  while (value < step && step / 10 >= 0.01) step /= 10;

  return step === rule.step ? rule : { ...rule, step };
}

/** Apply a rounding rule to a figure. */
export function applyRounding(value: number, rule: RoundingRule): number {
  if (!Number.isFinite(value)) {
    throw new RoundingError('invalid_value', 'That is not a figure we can round.');
  }

  if (rule.mode === 'none') {
    const factor = 10 ** MONEY_DP;
    return Math.round(value * factor) / factor;
  }

  const { stepUnits, offsetUnits } = latticeFor(scaleToFit(rule, value));
  const units = toUnits(value);

  // Integers throughout, so a value already on the lattice stays put.
  const fromOffset = units - offsetUnits;
  const k = fromOffset / stepUnits;
  const kDown = Math.floor(k);
  const kUp = Math.ceil(k);

  const candidate = (index: number): number => index * stepUnits + offsetUnits;

  if (rule.direction === 'up') return fromUnits(candidate(kUp));
  if (rule.direction === 'down') return fromUnits(candidate(kDown));

  const down = candidate(kDown);
  const up = candidate(kUp);
  const toDown = units - down;
  const toUp = up - units;

  if (toDown < toUp) return fromUnits(down);
  if (toUp < toDown) return fromUnits(up);

  // Exactly between. Resolved as configured rather than by whichever way the
  // language happens to lean.
  switch (rule.tie) {
    case 'up':
      return fromUnits(up);
    case 'down':
      return fromUnits(down);
    case 'even':
      return fromUnits(kDown % 2 === 0 ? down : up);
  }
}

/** Both figures a rule sits between, for showing the operator the choice. */
export function candidatesAround(
  value: number,
  rule: RoundingRule,
): { readonly below: number; readonly above: number } {
  if (rule.mode === 'none') {
    const exact = applyRounding(value, NONE);
    return { below: exact, above: exact };
  }

  return {
    below: applyRounding(value, { ...rule, direction: 'down' }),
    above: applyRounding(value, { ...rule, direction: 'up' }),
  };
}

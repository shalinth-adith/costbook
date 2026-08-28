/**
 * The charge stack — what a market piles on top of a menu price, and what the
 * operator actually keeps.
 *
 * Charges never change what a dish costs. They change what the guest pays and
 * what the operator banks, which are different questions and are asked at a
 * different moment (COSTING_MODELS Axis E).
 *
 * The whole problem is order and base. A stack is a pipeline, not a set of
 * percentages applied to one figure — which is how almost every spreadsheet
 * gets it wrong. Ten, then five, then five, applied to one base, gives 20%.
 * Applied as a compounding pipeline it gives 21.275%, and on a 400 bill that
 * is a real number the operator will notice does not match their till.
 *
 * No jurisdiction is encoded here and none ever should be. We compute what we
 * are told; we do not advise on what applies (COSTING_MODELS 4.3).
 */

export type ChargeMode = 'percent' | 'fixed';

/** What a percentage is taken of. */
export type ChargeBase =
  /** The menu price alone, ignoring anything added before this. */
  | 'net_subtotal'
  /** The price plus every compounding charge so far. */
  | 'running_total';

/**
 * Who pays. Almost every charge is added to the guest's bill; a delivery
 * platform commission behaves like a charge but comes out of the operator's
 * side, and a dish priced correctly for the counter can lose money on every
 * delivery order without this distinction.
 */
export type ChargeBorneBy = 'guest' | 'operator';

export type Channel = 'dine_in' | 'takeaway' | 'delivery';

export interface Charge {
  readonly name: string;
  readonly mode: ChargeMode;
  /** A percentage when mode is 'percent', an amount of money when 'fixed'. */
  readonly value: number;
  readonly base: ChargeBase;
  /** Position in the pipeline. Lower runs first. */
  readonly order: number;
  /** Whether later charges are taken on top of this one. */
  readonly compounds: boolean;
  readonly borneBy: ChargeBorneBy;
  readonly channels: readonly Channel[];
}

export interface ChargeLine {
  readonly name: string;
  readonly amount: number;
  readonly borneBy: ChargeBorneBy;
  /** What the next charge would be taken on, if it compounds. */
  readonly runningAfter: number;
}

export interface ChargedPrice {
  /** The menu price before anything is added. */
  readonly net: number;
  readonly lines: readonly ChargeLine[];
  /** What the guest is billed. */
  readonly guestTotal: number;
  /** Charges the operator absorbs, such as a platform commission. */
  readonly operatorDeductions: number;
  /** net minus what the operator absorbs. The answer to "what do I keep?". */
  readonly operatorKeeps: number;
}

export type ChargeErrorCode = 'invalid_value' | 'not_solvable';

export class ChargeError extends Error {
  readonly code: ChargeErrorCode;
  readonly charge: string | null;

  constructor(code: ChargeErrorCode, message: string, charge: string | null = null) {
    super(message);
    this.name = 'ChargeError';
    this.code = code;
    this.charge = charge;
  }
}

/**
 * Every figure in the pipeline is a straight line in the net price:
 * `slope x net + constant`. A percentage scales both parts, a fixed amount
 * moves the constant, and nothing here is ever anything but linear.
 *
 * Tracking it this way is what makes the reverse solve exact. Searching for a
 * net price that lands on a given display price would work, and would also
 * round-trip to a figure a few paise out — which is exactly the kind of drift
 * users read as a bug (TRD 4).
 */
interface Linear {
  readonly slope: number;
  readonly constant: number;
}

const at = (line: Linear, net: number): number => line.slope * net + line.constant;
const add = (a: Linear, b: Linear): Linear => ({
  slope: a.slope + b.slope,
  constant: a.constant + b.constant,
});
const scale = (line: Linear, factor: number): Linear => ({
  slope: line.slope * factor,
  constant: line.constant * factor,
});

const NET: Linear = { slope: 1, constant: 0 };
const ZERO: Linear = { slope: 0, constant: 0 };

function assertValid(charge: Charge): void {
  if (!Number.isFinite(charge.value) || charge.value < 0) {
    throw new ChargeError(
      'invalid_value',
      `${charge.name} needs a figure of zero or more. Remove it if it does not apply.`,
      charge.name,
    );
  }
}

/** Charges that apply to this channel, in the order they are taken. */
export function stackFor(charges: readonly Charge[], channel: Channel): readonly Charge[] {
  return charges
    .filter((c) => c.channels.includes(channel))
    .slice()
    .sort((a, b) => a.order - b.order);
}

interface SolvedLine {
  readonly name: string;
  readonly amount: Linear;
  readonly borneBy: ChargeBorneBy;
  readonly runningAfter: Linear;
}

interface Solved {
  readonly lines: readonly SolvedLine[];
  readonly guestTotal: Linear;
  readonly operatorDeductions: Linear;
}

/** Runs the pipeline symbolically, so it can be evaluated forwards or inverted. */
function solve(charges: readonly Charge[], channel: Channel): Solved {
  let running: Linear = NET;
  let guestTotal: Linear = NET;
  let operatorDeductions: Linear = ZERO;
  const lines: SolvedLine[] = [];

  for (const charge of stackFor(charges, channel)) {
    assertValid(charge);

    const base = charge.base === 'net_subtotal' ? NET : running;
    const amount: Linear =
      charge.mode === 'percent'
        ? scale(base, charge.value / 100)
        : { slope: 0, constant: charge.value };

    if (charge.borneBy === 'guest') {
      guestTotal = add(guestTotal, amount);
    } else {
      operatorDeductions = add(operatorDeductions, amount);
    }

    // A charge the operator absorbs is not on the bill, so nothing is taken on
    // top of it either.
    if (charge.compounds && charge.borneBy === 'guest') running = add(running, amount);

    lines.push({ name: charge.name, amount, borneBy: charge.borneBy, runningAfter: running });
  }

  return { lines, guestTotal, operatorDeductions };
}

/**
 * Forward: a menu price in, a guest total out, with every charge itemised.
 *
 * Full precision throughout. Rounding a running total at each step is where a
 * bill stops reconciling with a till (TRD 4).
 */
export function applyCharges(
  net: number,
  charges: readonly Charge[],
  channel: Channel,
): ChargedPrice {
  if (!Number.isFinite(net) || net < 0) {
    throw new ChargeError('invalid_value', 'A menu price cannot be negative.');
  }

  const solved = solve(charges, channel);
  const operatorDeductions = at(solved.operatorDeductions, net);

  return {
    net,
    lines: solved.lines.map((l) => ({
      name: l.name,
      amount: at(l.amount, net),
      borneBy: l.borneBy,
      runningAfter: at(l.runningAfter, net),
    })),
    guestTotal: at(solved.guestTotal, net),
    operatorDeductions,
    operatorKeeps: net - operatorDeductions,
  };
}

/**
 * Reverse: the number to print, given the number to keep.
 *
 * Most menus display an all-in price, so the operator's real question is not
 * "what do these charges add" but "what do I put on the menu so that what I
 * keep hits my target". That means solving backwards through a compounding
 * stack, which is the part nobody's spreadsheet does (COSTING_MODELS Axis E).
 */
export function netFromGuestTotal(
  guestTotal: number,
  charges: readonly Charge[],
  channel: Channel,
): number {
  if (!Number.isFinite(guestTotal) || guestTotal < 0) {
    throw new ChargeError('invalid_value', 'A bill total cannot be negative.');
  }

  const { slope, constant } = solve(charges, channel).guestTotal;

  if (slope <= 0) {
    throw new ChargeError(
      'not_solvable',
      'These charges do not scale with the menu price, so no price produces that total.',
    );
  }

  return (guestTotal - constant) / slope;
}

/**
 * The mirror, and the one that makes owners stop and look: this dish sells at
 * 119 — what do I actually keep after every charge?
 */
export function operatorKeepsFrom(
  guestTotal: number,
  charges: readonly Charge[],
  channel: Channel,
): number {
  const net = netFromGuestTotal(guestTotal, charges, channel);
  return applyCharges(net, charges, channel).operatorKeeps;
}

/** What the stack adds, as a percentage of the menu price. */
export function effectiveRate(charges: readonly Charge[], channel: Channel): number {
  return (solve(charges, channel).guestTotal.slope - 1) * 100;
}

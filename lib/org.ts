/**
 * The organisation model — everything the setup wizard asks and Settings edits.
 *
 * Four of these are asked at setup (A22) because they cannot be guessed: the
 * name, the currency, how supplier tax reaches the operator, and what food cost
 * they are aiming for. Everything else starts from a default and is changed
 * where it acts, on the dish, which is why each one carries a DEFAULT chip.
 *
 * Nothing here computes. It records what the operator told us so `core/` can be
 * handed the same answer every time.
 */

import type { Charge } from '@/core/charges';
import type { PresetName } from '@/core/rounding';

/**
 * Whether tax a supplier bills is recoverable.
 *
 * This changes no arithmetic in `core/`. It changes which figure the operator
 * is asked to type: an operator who claims the tax back enters rates net of it,
 * because the tax is not their cost; one who absorbs it enters rates gross,
 * because every rupee is. Getting it backwards misprices a whole menu by the
 * tax rate, which is why A22 asks rather than defaulting silently.
 */
export type TaxTreatment = 'recoverable' | 'absorbed';

export interface Org {
  readonly name: string;
  /** Set once. Costbook never converts — see `currencyIsSettable`. */
  readonly currency: string;
  readonly taxTreatment: TaxTreatment | null;
  /** What the guest pays on top of the menu price, in the order applied. */
  readonly charges: readonly Charge[];
  /** The share of a dish's price the operator will spend on ingredients. */
  readonly foodCostTarget: number;
  readonly rounding: PresetName;
  readonly wastagePercent: number;
  readonly packagingPerPortion: number;
  /** After this long a rate is marked stale, on the ingredient and the dish. */
  readonly staleAfterDays: number;
  readonly defaultMassUnit: 'g' | 'kg';
  readonly defaultVolumeUnit: 'ml' | 'l';
  /** False until the wizard is finished, which is what routes a new account. */
  readonly setupDone: boolean;
}

/**
 * What an account starts as, before the wizard.
 *
 * `taxTreatment` is null rather than a guess. It is the only field here with no
 * safe default: either answer is wrong for half of all operators, and both are
 * wrong by a whole tax rate. A22 gives it a third path — a worked example —
 * rather than choosing for them.
 */
export const BLANK_ORG: Org = {
  name: '',
  currency: 'INR',
  taxTreatment: null,
  charges: [],
  foodCostTarget: 30,
  rounding: 'next_9',
  wastagePercent: 2,
  packagingPerPortion: 0.35,
  staleAfterDays: 90,
  defaultMassUnit: 'g',
  defaultVolumeUnit: 'ml',
  setupDone: false,
};

/** The four the wizard asks, in order, for the progress ticks in A22. */
export const SETUP_STEPS = [
  { no: 1, label: 'Your place' },
  { no: 2, label: 'Supplier tax' },
  { no: 3, label: "The bill" },
  { no: 4, label: 'Your target' },
] as const;

export const TARGET_MIN = 15;
export const TARGET_MAX = 45;

/**
 * Whether a step has been answered well enough to move past it.
 *
 * Step 3 is answered by having no charges just as much as by having several —
 * "nothing on top" is the common answer, and A22 makes it the primary button
 * rather than a Skip link, so it counts as complete from the start.
 */
export function stepAnswered(org: Org, step: number): boolean {
  if (step === 1) return org.name.trim() !== '' && org.currency !== '';
  if (step === 2) return org.taxTreatment !== null;
  if (step === 3) return true;
  if (step === 4) return org.foodCostTarget >= TARGET_MIN && org.foodCostTarget <= TARGET_MAX;
  return false;
}

export function setupComplete(org: Org): boolean {
  return [1, 2, 3, 4].every((s) => stepAnswered(org, s));
}

/**
 * The example under the target slider: a dish costing X sells at Y.
 *
 * A22 makes this sentence the largest text on the step, because a target is a
 * percentage until it is a price. The cost is held fixed so the price moves as
 * the slider moves, which is the relationship being demonstrated.
 */
export function targetExample(target: number, cost = 12): { cost: number; price: number; multiple: number } {
  const price = cost / (target / 100);
  return { cost, price, multiple: price / cost };
}

/** What Settings shows as the summary of an answered wizard. */
export function taxLabel(t: TaxTreatment | null): string {
  if (t === 'recoverable') return 'Claimed back — rates entered without tax';
  if (t === 'absorbed') return 'Absorbed — rates entered with tax included';
  return 'Not answered yet';
}


/**
 * Two roles, on purpose (A27).
 *
 * Owner can change costing, charges, billing and people. Manager can cost
 * dishes, edit rates and print cards, but cannot reprice the menu or see the
 * bill. A kitchen does not need a permissions matrix, and every role added is
 * one more thing to get wrong in the middle of service.
 */
export type Role = 'owner' | 'manager';

export interface Member {
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  /** Null for someone invited who has not signed in yet. */
  readonly lastIn: string | null;
  readonly accepted: boolean;
}

export type Plan = 'free' | 'paid';

/**
 * What the free tier holds. Enough to prove it works, not enough to run a
 * kitchen on — and nothing is deleted or locked away at the limit, only added
 * to (A27 Billing).
 */
export const FREE_LIMITS = {
  recipes: 40,
  ingredients: 250,
  importsPerMonth: 1,
  rateHistory: 3,
} as const;

export function atFreeLimit(recipeCount: number, p: Plan): boolean {
  return p === 'free' && recipeCount >= FREE_LIMITS.recipes;
}

export function canDo(role: Role, what: 'costing' | 'charges' | 'billing' | 'team' | 'recipes' | 'rates'): boolean {
  if (role === 'owner') return true;
  return what === 'recipes' || what === 'rates';
}

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
import type { PricingMethod } from '@/lib/costing';

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
  /** Where the restaurant is, as a two-letter code. Proposes the currency once. */
  readonly country: string | null;
  /** How many people work in the kitchen, as a band (lib/countries.ts). */
  readonly teamSize: string | null;
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
  /** The last step of the ladder and its figure. See lib/costing.ts. */
  readonly pricingMethod: PricingMethod;
  readonly moneyPerPlate: number;
  readonly factor: number;
  /** The three lines a small kitchen leaves out. Zero means "not counted". */
  readonly accompanimentsPerPortion: number;
  readonly labourRatePerHour: number;
  readonly overheadPerPortion: number;
  /** Whether the menu price already includes the guest's charges. */
  readonly pricesIncludeCharges: boolean;
  /** A rate that moves more than this in a month earns a line on the dashboard. */
  readonly alertMovePercent: number;
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
  country: null,
  teamSize: null,
  currency: 'INR',
  taxTreatment: null,
  charges: [],
  foodCostTarget: 30,
  rounding: 'up_whole',
  wastagePercent: 0,
  packagingPerPortion: 0,
  pricingMethod: 'food_share',
  moneyPerPlate: 0,
  factor: 3.3,
  accompanimentsPerPortion: 0,
  labourRatePerHour: 0,
  overheadPerPortion: 0,
  pricesIncludeCharges: false,
  alertMovePercent: 10,
  staleAfterDays: 90,
  defaultMassUnit: 'g',
  defaultVolumeUnit: 'ml',
  setupDone: false,
};

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
  /**
   * Stable identity: the user id for someone on the book, the invitation id
   * for someone who has been asked and not signed up yet.
   *
   * Not the email. RLS does not expose auth.users, so every member except the
   * caller has an empty one — and removing a manager by an empty string
   * removes nobody, which is exactly what Remove used to do.
   */
  readonly id: string;
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
  /*
   * Six. It was ten (PRD 9, FLOWS 9), and the code once said forty. The free
   * trial is for finding out whether the arithmetic matches your own sheet,
   * and six dishes costed properly answer that; a café that has costed ten is
   * not evaluating any more, it is running on it. After six the book is
   * bought for a stretch of months (lib/plan.ts).
   */
  recipes: 6,
  ingredients: 250,
  importsPerMonth: 1,
  rateHistory: 3,
} as const;

/**
 * What the paid tier costs, in one place.
 *
 * Written down here because it was written down twice: as a figure in the
 * landing page's markup, and as nothing at all in Settings, whose "compare
 * with paid" button changed the plan instead of naming a price. Two copies of
 * a price is one copy and one lie waiting to happen.
 *
 * Billed in rupees regardless of the currency an account costs in — Costbook
 * does not convert, and a subscription is not a menu price. PRD 9 also lists a
 * dirham figure for the UAE; that arrives with the payment provider that can
 * charge it, and this is the shape it will arrive into.
 */
export const PAID_MONTHLY = {
  amount: 750,
  currency: 'INR',
  symbol: '\u20B9',
} as const;

export function atFreeLimit(recipeCount: number, p: Plan): boolean {
  return p === 'free' && recipeCount >= FREE_LIMITS.recipes;
}

/**
 * Whether a plan may import a sheet.
 *
 * Paid only. The free tier is ten recipes entered by hand, and a workbook is
 * how a menu of eighty arrives — so exempting import from the cap would leave
 * a free account holding a costed eighty-dish menu and make the cap
 * decorative, while truncating an import at ten would end the product's best
 * moment in a menu cut off mid-alphabet.
 *
 * Note this is stricter than the Settings copy's "repeat imports are what the
 * paid tier is for", which assumed the first one was free. It is not.
 */
export function canImport(p: Plan): boolean {
  return p === 'paid';
}

export function canDo(role: Role, what: 'costing' | 'charges' | 'billing' | 'team' | 'recipes' | 'rates'): boolean {
  if (role === 'owner') return true;
  return what === 'recipes' || what === 'rates';
}


/**
 * How a rate arrived.
 *
 * Only the application knows this — a database trigger sees the same UPDATE
 * whether someone typed it, an import wrote it, or a chef confirmed it on the
 * kitchen screen. Recording it as "manual" by omission made an import of 238
 * rates look like 238 mornings of work.
 */
export type RateSource = 'manual' | 'import' | 'confirmed';

/** One move of one rate. Append-only; see the store's `rateHistory`. */
export interface RateChange {
  /**
   * The price of a pack, not a rate per unit — which is why `qty` travels with
   * it. Null when this was the first rate the ingredient ever carried.
   */
  readonly from: number | null;
  readonly to: number;
  /**
   * The pack size those prices were for, in the family's base unit.
   *
   * Recorded because a supplier who changes the price often changes the pack
   * with it. Without this, recosting a dish "as it stood before" would divide
   * last month's price by this month's pack.
   */
  readonly qty: number;
  /** ISO date. */
  readonly on: string;
  readonly source: RateSource;
}

/**
 * Whether this record moved the figure.
 *
 * A confirmation carries the same rate on both sides. It is real work and
 * belongs in the history — "confirmed today" is what A39's tie-breaker reads —
 * but counting it as a movement would make an ingredient look volatile for
 * having been checked.
 */
export function isMovement(change: RateChange): boolean {
  return change.from !== change.to;
}

/**
 * Which of these people is the caller.
 *
 * Pulled out of `lib/book.ts` so the rule can be tested without a session or a
 * database — the same reason `lib/auth.ts` holds the sign-in policy and not
 * the sign-in screen.
 *
 * The rule is only "match on the id", and it is here because the code it
 * replaced did not have one. `book()` handed back every membership row in the
 * organisation, and `afterSignIn` read `members[0]` and called it theirs.
 * `memberships` is returned in no guaranteed order and pending invitations are
 * concatenated onto the same list, so that first row was the owner about as
 * often as it was the person signing in.
 *
 * Null for a caller who is on no row: a session whose membership was removed
 * while they were still looking at the app. Null is not 'manager' — a manager
 * may still cost a dish.
 */
export function roleOf(
  rows: readonly { readonly user_id: string; readonly role: Role }[],
  userId: string | null,
): Role | null {
  if (userId === null) return null;
  return rows.find((m) => m.user_id === userId)?.role ?? null;
}

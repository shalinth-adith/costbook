import { operatorKeepsFrom } from "@/core/charges";

import type { CostBuildUp, CostingModel } from "./costing";
import { netPriceOf } from "./costing";

/**
 * Where every hundred a guest pays actually goes.
 *
 * The sheet this product was built against prices at cost ÷ 0.2, and that
 * 0.2 came from the trade rather than from the kitchen's own books. It is a
 * good rule of thumb and it answers only one question: what share of the
 * price is food. It says nothing about whether what is left covers the rent.
 *
 * Costbook already holds the rest — packaging, the sides that go on every
 * plate, kitchen time at the account's rate, overhead per plate, and what a
 * delivery platform takes. This adds the last step nobody had taken: subtract
 * all of it from the price and name what remains.
 *
 * The honesty rule for this screen: a figure the operator has not given is
 * NOT zero, it is unknown. An account that has entered no rent and no wages
 * would otherwise be shown a fat "what is left" and told it was profit. So
 * every part that was never entered is counted and named as missing, and the
 * remainder is only ever called profit when nothing is missing.
 */
export type SliceKind =
  | "food"
  | "packaging"
  | "sides"
  | "kitchen_time"
  | "overheads"
  | "commission"
  | "left";

export interface Slice {
  readonly kind: SliceKind;
  /** In the kitchen's words, not the ledger's. */
  readonly label: string;
  /** Money per plate. */
  readonly amount: number;
  /** Of every hundred the guest pays. Negative for a loss. */
  readonly share: number;
  /**
   * True when this is a figure nobody has entered, counted as nothing.
   * A share of zero that means "not counted" is a different fact from a
   * share of zero that means "we spend nothing on it".
   */
  readonly missing: boolean;
}

export interface WhereItGoes {
  /** What the guest pays, which is what the shares are shares of. */
  readonly price: number;
  /** Everything except what is left, in the order the money leaves. */
  readonly slices: readonly Slice[];
  /** The remainder. Negative means this plate loses money. */
  readonly left: Slice;
  /**
   * The parts of the kitchen's costs nobody has told Costbook about. While
   * this is not empty, `left` is an upper bound and must be said as one.
   */
  readonly notCounted: readonly SliceKind[];
  /** True when every part is known, so the remainder really is profit. */
  readonly complete: boolean;
}

const round = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * @param price What the guest pays — the sticker, not the net.
 */
export function whereItGoes(
  price: number,
  build: CostBuildUp,
  model: CostingModel,
): WhereItGoes | null {
  // A dish with no portions has no per-plate anything, and a dish short a
  // rate has a floor rather than a cost. Neither can be split honestly.
  if (
    !build.complete ||
    build.total === null ||
    build.ingredientsPerPortion === null
  )
    return null;
  if (!Number.isFinite(price) || price <= 0) return null;

  /*
   * What the kitchen actually receives.
   *
   * Tax the guest pays passes straight through and was never the kitchen's;
   * a platform's commission is taken out of the kitchen's side. Both are in
   * the charge stack, and the difference between them is the whole reason
   * this cannot be `price` minus costs.
   */
  const net = netPriceOf(price, model);
  const keeps =
    model.charges.length === 0
      ? net
      : operatorKeepsFrom(price, model.charges, "dine_in");
  const commission = round(net - keeps);

  const share = (amount: number): number => round((amount / price) * 100);

  const food = build.ingredientsPerPortion + (build.wastage?.amount ?? 0);

  const parts: readonly {
    kind: SliceKind;
    label: string;
    amount: number;
    missing: boolean;
  }[] = [
    { kind: "food", label: "Food", amount: food, missing: false },
    {
      kind: "packaging",
      label: "Packaging",
      amount: build.packaging?.amount ?? 0,
      missing: build.packaging === null || build.packaging.amount === 0,
    },
    {
      kind: "sides",
      label: "What goes on every plate",
      amount: build.accompaniments?.amount ?? 0,
      missing:
        build.accompaniments === null || build.accompaniments.amount === 0,
    },
    {
      kind: "kitchen_time",
      label: "Kitchen time",
      amount: build.labour?.amount ?? 0,
      missing: build.labour === null || build.labour.amount === 0,
    },
    {
      kind: "overheads",
      label: "Rent, gas and power",
      amount: build.overhead?.amount ?? 0,
      missing: build.overhead === null || build.overhead.amount === 0,
    },
    {
      kind: "commission",
      label: "Taken by the platform",
      amount: commission,
      // Not a gap in the account's figures: a kitchen selling only at its own
      // counter genuinely pays no commission.
      missing: false,
    },
  ];

  const slices: Slice[] = parts
    .filter((p) => p.amount > 0 || p.missing)
    .map((p) => ({
      kind: p.kind,
      label: p.label,
      amount: round(p.amount),
      share: share(p.amount),
      missing: p.missing,
    }));

  const spent = parts.reduce((n, p) => n + p.amount, 0);
  const remainder = round(price - spent);
  const notCounted = parts.filter((p) => p.missing).map((p) => p.kind);

  return {
    price: round(price),
    slices,
    left: {
      kind: "left",
      label:
        notCounted.length === 0
          ? "Left for you"
          : "Left, before what is not counted",
      amount: remainder,
      share: share(remainder),
      missing: false,
    },
    notCounted,
    complete: notCounted.length === 0,
  };
}

/**
 * The short name of each, for listing several in one sentence.
 *
 * `SAID` reads well under a row on its own and terribly in a list: "you have
 * not told Costbook what boxes, bags and cutlery, the chutney, the sambar,
 * the bread, wages at your kitchen rate cost a plate" is not a sentence.
 */
export const SHORT: Readonly<Record<SliceKind, string>> = {
  food: 'food',
  packaging: 'packaging',
  sides: 'what goes on every plate',
  kitchen_time: 'kitchen time',
  overheads: 'rent, gas and power',
  commission: 'commission',
  left: 'what is left',
};

/** The four kinds a kitchen can enter, in the words Settings uses for them. */
export const SAID: Readonly<Record<SliceKind, string>> = {
  food: "the ingredients on the recipe",
  packaging: "boxes, bags and cutlery",
  sides: "the chutney, the sambar, the bread",
  kitchen_time: "wages, at your kitchen rate",
  overheads: "rent, gas and power a plate",
  commission: "a delivery platform's cut",
  left: "what is left",
};

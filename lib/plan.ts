/**
 * The paid plan: what it costs for how long, and whether an account is on it.
 *
 * The free trial is six dishes. After that the book is bought for a stretch
 * of months — one, three, six or twelve — paid once, up front. Nothing renews
 * by itself: when the stretch ends the account is back on free, everything it
 * costed stays, and the next stretch is bought here. A subscription that
 * charges a card nobody remembers giving is the kind of thing this product
 * exists to make visible in other people's businesses; it should not do it
 * in its own.
 *
 * Priced in rupees whatever the menu is costed in (see PAID_MONTHLY). The
 * longer terms are cheaper per month; the ladder is one place to change.
 */

import { PAID_MONTHLY, type Plan } from "./org";

export type Term = "monthly" | "quarter" | "half" | "year";

export interface PlanTerm {
  readonly id: Term;
  readonly months: number;
  /** The whole stretch, paid once, in PAID_MONTHLY.currency. */
  readonly amount: number;
  readonly label: string;
  readonly said: string;
}

export const TERMS: readonly PlanTerm[] = [
  {
    id: "monthly",
    months: 1,
    amount: PAID_MONTHLY.amount,
    label: "A month",
    said: "Pay as you go",
  },
  {
    id: "quarter",
    months: 3,
    amount: 2100,
    label: "Three months",
    said: "A season",
  },
  {
    id: "half",
    months: 6,
    amount: 3900,
    label: "Six months",
    said: "Half a year",
  },
  {
    id: "year",
    months: 12,
    amount: 7200,
    label: "A year",
    said: "Two months on us",
  },
];

export function termOf(id: string | null | undefined): PlanTerm | undefined {
  return TERMS.find((t) => t.id === id);
}

/** What a term works out to a month, whole rupees. */
export function perMonth(t: PlanTerm): number {
  return Math.round(t.amount / t.months);
}

/** What the same months would cost bought one at a time, less what they cost here. */
export function saving(t: PlanTerm): number {
  return PAID_MONTHLY.amount * t.months - t.amount;
}

/**
 * The day a stretch bought on `start` ends.
 *
 * The same day of the month, `months` later; a 31st that lands in a shorter
 * month becomes that month's last day rather than spilling into the next.
 * Whole days, at the same time of day as the start, so "ends on the 5th"
 * means the 5th.
 */
export function endOf(start: Date, months: number): Date {
  const d = new Date(start.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/** The subscriptions row, as the book reads it. */
export interface Subscription {
  readonly plan: Plan;
  readonly status: string;
  readonly term: Term | null;
  readonly startedAt: string | null;
  readonly periodEnd: string | null;
  /** What the payment provider called it, or "sandbox" for a test activation. */
  readonly reference: string | null;
}

export const FREE_SUBSCRIPTION: Subscription = {
  plan: "free",
  status: "active",
  term: null,
  startedAt: null,
  periodEnd: null,
  reference: null,
};

/**
 * Which tier the account is on right now.
 *
 * Paid while the row says paid and the stretch has not ended. A paid row with
 * no end date is from before terms existed, recorded by hand; it stays paid,
 * because a limit that reappears on an account someone arranged in person is
 * a support call, not a policy.
 */
export function tierOf(sub: Subscription, now: Date = new Date()): Plan {
  if (sub.plan !== "paid") return "free";
  if (sub.periodEnd === null) return "paid";
  return new Date(sub.periodEnd).getTime() > now.getTime() ? "paid" : "free";
}

/** Whole days until the stretch ends; null when there is no stretch. Negative once it has. */
export function daysLeft(
  sub: Subscription,
  now: Date = new Date(),
): number | null {
  if (sub.periodEnd === null) return null;
  const ms = new Date(sub.periodEnd).getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

/** Whether the row records a stretch that has run out. */
export function lapsed(sub: Subscription, now: Date = new Date()): boolean {
  return (
    sub.plan === "paid" && sub.periodEnd !== null && tierOf(sub, now) === "free"
  );
}

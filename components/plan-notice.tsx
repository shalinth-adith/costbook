import Link from "next/link";

import type { Plan } from "@/lib/org";
import { type Subscription, daysLeft, lapsed, termOf } from "@/lib/plan";

/** A week. What the plans page promises the owner will be given. */
const WARN_WITHIN_DAYS = 7;

const onDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * The one sentence a plan owes the owner before it ends.
 *
 * The plans page says "you are told a week before it ends", and nothing read
 * the end date anywhere else — so the promise was kept by no code at all. A
 * stretch is paid once and never renews, which is the point; that only works
 * if the ending is announced somewhere the owner already looks.
 *
 * Silent while there is more than a week left, because a banner shown every
 * day for a month is a banner nobody reads on the day it matters.
 */
export function PlanNotice({
  plan,
  subscription,
  today = new Date(),
}: {
  plan: Plan;
  subscription: Subscription;
  today?: Date;
}) {
  const ended = lapsed(subscription, today);
  const left = daysLeft(subscription, today);
  const ends = subscription.periodEnd;

  if (
    !ended &&
    (plan !== "paid" ||
      ends === null ||
      left === null ||
      left > WARN_WITHIN_DAYS)
  ) {
    return null;
  }

  if (ended) {
    return (
      <div className="card card-note plan-notice is-ended">
        <b>Your plan ended on {onDay(ends ?? new Date().toISOString())}.</b>{" "}
        Every dish you costed is still here and still printable. Adding another,
        and importing, wait for the next stretch.{" "}
        <Link className="link" href="/plans">
          Buy one
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="card card-note plan-notice">
      <b>
        {left === 0
          ? "Your plan ends today."
          : left === 1
            ? "Your plan ends tomorrow."
            : `Your plan ends in ${String(left)} days.`}
      </b>{" "}
      {termOf(subscription.term)?.label ?? "It"} runs to {onDay(ends ?? "")}.
      Nothing renews by itself, so buy the next stretch when you want it and it
      starts the day this one ends.{" "}
      <Link className="link" href="/plans">
        See the plans
      </Link>
      .
    </div>
  );
}

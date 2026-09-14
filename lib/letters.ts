import { SUPPORT_EMAIL } from "./org";
import { type Subscription, type Term, termOf } from "./plan";

/**
 * What Costbook writes to a café about its plan.
 *
 * Four letters, and the shape of the product decides all four. Costbook sells
 * a stretch of months paid once, and nothing renews — so there is no failed
 * charge to report, no mandate to restore and nothing to cancel. What there
 * is instead is a date that arrives: the reminder is the renewal path, and a
 * paying kitchen that is not told will lapse without ever deciding to.
 *
 * THE COPY IS HERE, AWAY FROM THE SENDING. A letter is the product speaking
 * to somebody who is not looking at it, usually about money, and it is the
 * part of this feature worth testing. The posting is plumbing.
 *
 * PLAIN TEXT, NOT HTML. The messages are short, they carry one link at most,
 * and a plain body cannot render wrongly in anybody's client — a kitchen
 * reading this on a phone over a bad connection gets exactly what was sent.
 */

export interface Letter {
  readonly subject: string;
  readonly body: string;
}

/** A date, said the way a person says it: "14 October 2026". */
export function dateSaid(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Money, with its symbol, for a letter rather than a column. */
export function moneySaid(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  const symbol = currency.toUpperCase() === "INR" ? "₹" : `${currency} `;
  return `${symbol}${major.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const SIGN_OFF = `\n\nIf anything here looks wrong, reply to this and a person will read it.\n— Costbook · ${SUPPORT_EMAIL}`;

/**
 * 1. Bought. What was bought, what it cost, and — the part only Costbook can
 * say — the date the book is paid up to.
 *
 * The provider sends its own payment receipt. That receipt proves money moved;
 * it cannot say when the months run out, which is the fact the buyer actually
 * needs and the one they will come back looking for.
 */
export function boughtLetter(input: {
  readonly term: Term;
  readonly amountMinor: number;
  readonly currency: string;
  readonly until: string;
  readonly orgName: string;
}): Letter {
  const t = termOf(input.term);
  const label = t?.label ?? "Your plan";
  return {
    subject: `Costbook is on until ${dateSaid(input.until)}`,
    body:
      `${label} is paid for and ${input.orgName} is on the paid plan.\n\n` +
      `Paid: ${moneySaid(input.amountMinor, input.currency)}\n` +
      `Runs until: ${dateSaid(input.until)}\n\n` +
      `Every dish, every rate and every sheet you have costed is unlimited ` +
      `while it runs, and importing a supplier's price list is open.\n\n` +
      `Nothing renews by itself and no card is kept on file. When the months ` +
      `run out the book goes back to the free tier — everything you have ` +
      `costed stays exactly where it is — and you decide then whether to buy ` +
      `another stretch.` +
      SIGN_OFF,
  };
}

/**
 * 2. Ending. Sent once, a week out.
 *
 * It has to say what lapsing costs and what it does not, because the fear it
 * creates otherwise is that the work disappears. It does not: the recipes,
 * the rates and the costing all stay, and so does the export pass if one was
 * ever bought.
 */
export function endingLetter(input: {
  readonly until: string;
  readonly days: number;
  readonly orgName: string;
}): Letter {
  const when =
    input.days <= 1 ? "tomorrow" : `in ${String(input.days)} days`;
  return {
    subject: `${input.orgName}: your Costbook months end ${when}`,
    body:
      `Your paid stretch runs out on ${dateSaid(input.until)} — ${when}.\n\n` +
      `Nothing is charged automatically. There is no card on file, so if you ` +
      `do nothing the book simply goes back to the free tier on that date.\n\n` +
      `What stays, whatever you decide: every dish you have costed, every ` +
      `rate, every sub-recipe and every figure on them. Nothing is deleted ` +
      `and nothing is hidden.\n\n` +
      `What closes on the free tier: costing beyond six dishes, and importing ` +
      `a price list.\n\n` +
      `Another stretch is bought in the app under Your plan.` +
      SIGN_OFF,
  };
}

/** 3. Ended. The same facts, in the past tense, with nothing lost. */
export function endedLetter(input: {
  readonly until: string;
  readonly orgName: string;
}): Letter {
  return {
    subject: `${input.orgName} is back on the free tier`,
    body:
      `Your paid months ran out on ${dateSaid(input.until)} and the book is ` +
      `back on the free tier.\n\n` +
      `Nothing has been deleted. Every dish you costed is still costed, every ` +
      `rate is still on file, and the prep cards still print. If you bought ` +
      `the export pass, it is still yours — that was bought once and stays ` +
      `bought.\n\n` +
      `What is shut: costing past six dishes, and importing a price list.\n\n` +
      `Buying another stretch turns both back on immediately, and the book ` +
      `picks up exactly where it is.` +
      SIGN_OFF,
  };
}

/**
 * 4. Money taken and nothing switched on.
 *
 * The one payment failure this product can have. Not a card being declined —
 * there is no card on file to decline — but a payment the provider captured
 * that Costbook could not apply. Two letters, because two people need to know
 * and they need different things: the café needs to be told it is known about
 * and that their money is not lost, and support needs the ids to fix it.
 */
export function stuckLetter(input: {
  readonly amountMinor: number;
  readonly currency: string;
  readonly orgName: string;
}): Letter {
  return {
    subject: "We have your payment and are switching your plan on",
    body:
      `Your payment of ${moneySaid(input.amountMinor, input.currency)} for ` +
      `${input.orgName} went through, and something on our side did not ` +
      `finish. Your plan is not on yet.\n\n` +
      `We know about it — this message was sent automatically the moment it ` +
      `happened, and a person is on it. You do not need to do anything, and ` +
      `you should not pay again.\n\n` +
      `If the plan is not on within a few hours, reply to this.` +
      SIGN_OFF,
  };
}

/** The same event, for whoever has to repair it. Ids, not reassurance. */
export function stuckAlert(input: {
  readonly orderId: string;
  readonly paymentId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly orgId: string;
  readonly said: string;
}): Letter {
  return {
    subject: `[costbook] payment taken, plan not on — order ${input.orderId}`,
    body:
      `A payment was captured and the plan did not switch on.\n\n` +
      `Order:    ${input.orderId}\n` +
      `Payment:  ${input.paymentId}\n` +
      `Org:      ${input.orgId}\n` +
      `Amount:   ${moneySaid(input.amountMinor, input.currency)}\n` +
      `Reason:   ${input.said}\n\n` +
      `The customer has been told it is known about and not to pay again.`,
  };
}

/**
 * Which reminder, if any, is due for a subscription today.
 *
 * Kept away from the job that sends them so the decision can be tested
 * without a database: it is the whole of the logic, and getting it wrong
 * means either silence or a letter every morning.
 *
 * A stretch bought while one is running extends the end date, and the stamps
 * are cleared when that happens — so the new stretch gets its own reminder in
 * its own time rather than inheriting a spent one.
 */
export type Due = "ending" | "ended" | null;

export const ENDING_DAYS = 7;

export function dueFor(
  sub: Pick<Subscription, "plan" | "periodEnd"> & {
    readonly endingNoticeAt: string | null;
    readonly endedNoticeAt: string | null;
  },
  now: Date = new Date(),
): Due {
  if (sub.periodEnd === null) return null;
  const ends = new Date(sub.periodEnd).getTime();
  const ms = ends - now.getTime();
  const days = Math.ceil(ms / 86_400_000);

  // Over. Said once, and only for a stretch that was actually paid for.
  if (ms <= 0) return sub.endedNoticeAt === null ? "ended" : null;

  /*
   * A week out, or anything less.
   *
   * "Less" matters: a job that only fires at exactly seven days sends nothing
   * at all if it fails to run one morning, and the one it misses is the one
   * the customer needed. Any day inside the window will do, because the stamp
   * stops the second.
   */
  if (days <= ENDING_DAYS) return sub.endingNoticeAt === null ? "ending" : null;

  return null;
}

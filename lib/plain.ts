/**
 * The figures, said the way a person says them.
 *
 * Everything on the dashboard was written by somebody who already knew what it
 * meant. "Middle dish 16.6%" — a term invented here that nobody has heard.
 * "56 cannot be placed yet" — placed on what? "Not weighted by how much each
 * dish sells" — a footnote to a statistician. The reader is a cook or the
 * person who owns the shop, and neither of them opened this to learn a
 * vocabulary.
 *
 * A percentage is the engineer's unit. An owner thinks in money: what comes in
 * over the counter, and what of it goes back out to the supplier. So the same
 * number is said as rupees in every hundred, which is a sentence anybody can
 * check against their own till.
 */

/**
 * A food cost percentage as money in every hundred taken.
 *
 * 16.6% is "about ₹17 of every ₹100". Rounded to a whole unit on purpose: the
 * decimal is precision the sentence does not carry, and "₹16.60 of every
 * ₹100.00" reads like a bill rather than a fact.
 */
export function perHundred(percent: number | null): number | null {
  if (percent === null) return null;
  return Math.round(percent);
}

export type Standing = "under" | "about" | "over";

/**
 * Where the menu sits against what the operator asked for.
 *
 * The same two-point window `statusFor` uses on a dish, so a menu and the
 * dishes in it are never described by two different rules.
 */
export function standingOf(
  percent: number | null,
  target: number,
): Standing | null {
  if (percent === null) return null;
  if (percent > target + 2) return "over";
  if (percent >= target - 2) return "about";
  return "under";
}

/**
 * Whether a headline figure deserves to be believed.
 *
 * The live book runs at 16.6% against a 30% target, which reads as a kitchen
 * doing wonderfully. It is not: 56 of its 79 dishes have no rate or no price,
 * so the figure describes the 23 that do. Printing it large without saying so
 * is the most confident wrong number this product could produce — it would
 * congratulate an operator on a margin that is an artefact of missing data.
 *
 * Two thirds is the line. Below it the headline is shown with what it is based
 * on stated beside it, not suppressed: a partial answer that says it is
 * partial still beats no answer.
 */
export function isTrustworthy(costed: number, total: number): boolean {
  if (total === 0) return false;
  return costed / total >= 2 / 3;
}

/** What a dish's food cost means, in the same money terms. */
export function dishSaid(
  cost: number | null,
  price: number | null,
  symbol: string,
): string | null {
  if (cost === null || price === null || price === 0) return null;
  const paise = Math.round((cost / price) * 100);
  return `${symbol}${String(paise)} of every ${symbol}100 you charge for it`;
}

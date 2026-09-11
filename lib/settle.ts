import { type Purchase, endOf, purchaseOf, startsAt, termOf } from "./plan";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Applying a payment when there is nobody signed in.
 *
 * This is the same three steps `confirmPayment` takes — claim the order, read
 * what it was for, switch that on — with one difference that changes
 * everything: no session. The browser path can lean on row security to prove
 * the order belongs to the caller. Here the ORDER ROW is the proof. It was
 * written when the checkout opened, by a request that did have a session, and
 * it carries the org, the term and the amount. Nothing in the delivery is
 * trusted for any of the three; the delivery names an order, and that is all.
 *
 * WHAT THE PROVIDER'S SIGNATURE DOES AND DOES NOT COVER. It proves the
 * delivery came from the provider. It does not prove the payment is for an
 * amount we asked for, so the amount is checked here against the recorded one
 * before anything is claimed.
 */

export type Settlement =
  /** Paid, and the stretch is on. */
  | { readonly outcome: "activated"; readonly bought: Purchase; readonly orgId: string }
  /** Paid, and the pass is on. */
  | { readonly outcome: "unlocked"; readonly orgId: string }
  /** Already settled — the browser got back first, or this is a redelivery. */
  | { readonly outcome: "already" }
  /** No such order here. Another environment's, or another deployment's. */
  | { readonly outcome: "unknown" }
  /** Real money, but not the money this order was for. Left alone, loudly. */
  | { readonly outcome: "mismatch"; readonly asked: number; readonly paid: number }
  /** The database refused. The caller should answer so the provider retries. */
  | { readonly outcome: "failed"; readonly said: string };

interface OrderRow {
  readonly org_id: string;
  readonly term: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: string;
}

export async function settleOrder(
  input: {
    readonly orderId: string;
    readonly paymentId: string;
    readonly amount: number;
    readonly currency: string;
  },
  now: Date = new Date(),
): Promise<Settlement> {
  const supabase = supabaseAdmin();

  /*
   * Look before claiming, so the amount can be checked while the order is
   * still open. Claiming first and checking after would leave an order marked
   * paid for money we then refused to honour — the worst of both.
   */
  const found = await supabase
    .from("payment_orders")
    .select("org_id, term, amount, currency, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (found.error !== null) {
    return { outcome: "failed", said: found.error.message };
  }
  const order = found.data as OrderRow | null;
  if (order === null) return { outcome: "unknown" };
  if (order.status !== "open") return { outcome: "already" };

  /*
   * The amount, in the smallest unit, exactly.
   *
   * Not "at least": the provider supports part-paying an order, and a partial
   * capture arrives here looking like any other payment. Accepting one would
   * hand over a year of Costbook for whatever the payer felt like sending.
   * A mismatch is never settled and never silently dropped — the caller says
   * so where somebody will read it.
   */
  if (order.amount !== input.amount) {
    return { outcome: "mismatch", asked: order.amount, paid: input.amount };
  }
  if (input.currency !== "" && order.currency !== input.currency) {
    return { outcome: "mismatch", asked: order.amount, paid: input.amount };
  }

  const bought = purchaseOf(order.term);
  if (bought === undefined) {
    // The check constraint should make this impossible. If it ever happens,
    // refusing is right: we do not guess what somebody paid for.
    return { outcome: "failed", said: `order is for an unknown term: ${order.term}` };
  }

  /*
   * The claim: one conditional update, open to paid, and only from open.
   *
   * This is the same lock `claimOrder` uses, for the same reason — two
   * deliveries of one payment, or a delivery racing the browser, must not both
   * win. Whichever statement lands second matches no row.
   */
  const claim = await supabase
    .from("payment_orders")
    .update({
      status: "paid",
      payment_id: input.paymentId,
      paid_at: now.toISOString(),
    })
    .eq("id", input.orderId)
    .eq("status", "open")
    .select("id");
  if (claim.error !== null) {
    /*
     * The unique index on payment_id trips here when this payment has already
     * claimed an order — a redelivery the browser beat us to. That is not a
     * failure and must not be retried: the same refusal, said by the database.
     */
    return { outcome: "already" };
  }
  if ((claim.data ?? []).length === 0) return { outcome: "already" };

  const applied = await apply(supabase, order.org_id, bought, input.paymentId, now);
  if (applied !== null) {
    /*
     * Two statements, no transaction between them.
     *
     * PostgREST gives one statement per call, so the order can be claimed and
     * the plan then fail to switch on — which is exactly the bug this whole
     * route exists to prevent, reappearing one step further along. So the
     * claim is put back and the caller answers with a 500: the provider
     * retries, and the retry finds a clean open order.
     *
     * If the rollback itself fails there is nothing left to try. It is logged
     * loudly, with the order id, because that is a human repair.
     */
    const undo = await supabase
      .from("payment_orders")
      .update({ status: "open", payment_id: null, paid_at: null })
      .eq("id", input.orderId);
    if (undo.error !== null) {
      console.error(
        `[razorpay] order ${input.orderId} is marked paid and its plan did ` +
          `not switch on, and the claim could not be undone. Payment ` +
          `${input.paymentId}. This needs fixing by hand. ${undo.error.message}`,
      );
    }
    return { outcome: "failed", said: applied };
  }

  return bought === "export"
    ? { outcome: "unlocked", orgId: order.org_id }
    : { outcome: "activated", bought, orgId: order.org_id };
}

/**
 * Switch on what the order was for. Returns null when it worked, or what the
 * database said when it did not.
 *
 * The arithmetic is `startsAt` and `endOf` — the same two functions the
 * browser path uses through `activateSubscription`, not a second copy. A
 * stretch bought while one is running still starts when that one ends.
 */
async function apply(
  supabase: ReturnType<typeof supabaseAdmin>,
  orgId: string,
  bought: Purchase,
  paymentId: string,
  now: Date,
): Promise<string | null> {
  const current = await supabase
    .from("subscriptions")
    .select("plan, current_period_end, exports_unlocked_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (current.error !== null) return current.error.message;

  const sub = current.data as {
    plan: string;
    current_period_end: string | null;
    exports_unlocked_at: string | null;
  } | null;
  if (sub === null) return `no subscription row for org ${orgId}`;

  // Never moved once set: a second payment must not reset the date the right
  // to take the work out was first earned.
  const unlocked = sub.exports_unlocked_at ?? now.toISOString();

  if (bought === "export") {
    // The pass buys carrying the work away and nothing else — the plan stays
    // free, the six-dish limit stays, the import stays shut.
    if (sub.exports_unlocked_at !== null) return null;
    const res = await supabase
      .from("subscriptions")
      .update({ exports_unlocked_at: unlocked })
      .eq("org_id", orgId);
    return res.error?.message ?? null;
  }

  const t = termOf(bought);
  if (t === undefined) return `not a term Costbook sells: ${bought}`;
  const from = startsAt(
    { plan: sub.plan === "paid" ? "paid" : "free", periodEnd: sub.current_period_end },
    now,
  );
  const res = await supabase
    .from("subscriptions")
    .update({
      plan: "paid",
      status: "active",
      term: t.id,
      started_at: from.toISOString(),
      current_period_end: endOf(from, t.months).toISOString(),
      provider_reference: `razorpay:${paymentId}`,
      exports_unlocked_at: unlocked,
    })
    .eq("org_id", orgId);
  return res.error?.message ?? null;
}

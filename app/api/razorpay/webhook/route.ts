import { settleOrder } from "@/lib/settle";
import {
  paymentFromWebhook,
  razorpayWebhookSecret,
  verifyWebhookSignature,
  webhooksConfigured,
} from "@/lib/razorpay";
import { serviceKeyPresent } from "@/lib/supabase/admin";

/**
 * The provider, telling us on its own.
 *
 * Until this existed a payment was confirmed by exactly one thing: the browser
 * that made it, coming back from checkout and calling `confirmPayment`. That
 * works right up until it doesn't — a tab closed on the bank's page, a phone
 * that loses signal on the way back, a battery. The provider has the money,
 * Costbook never hears, the order stays 'open', and the back office does not
 * show it because it lists orders that are paid. The first anyone learns is a
 * message saying "I paid and it is still locked".
 *
 * So the provider is given a second way to tell us, one that does not depend
 * on a browser being alive. Both paths end in the same place and neither can
 * double-apply: the order is claimed by one conditional update, open to paid,
 * and whichever arrives second matches no row.
 *
 * REGISTERING IT. Razorpay dashboard → Settings → Webhooks → Add New Webhook:
 *
 *   URL     https://<your domain>/api/razorpay/webhook
 *   Secret  anything long and random — it is NOT the API secret, and it goes
 *           in RAZORPAY_WEBHOOK_SECRET
 *   Events  payment.captured   (order.paid works too; either is enough)
 *
 * It answers 200 to everything it understood, including events it ignores and
 * payments already applied, because a non-2xx makes the provider redeliver for
 * a day. It answers 500 only when a retry could actually help.
 */
export const dynamic = "force-dynamic";

/** Say it once, the same way, and never leak which check failed. */
const plain = (body: string, status: number) =>
  new Response(`${body}\n`, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });

export async function POST(request: Request): Promise<Response> {
  /*
   * Refuse before reading anything when the endpoint is not set up.
   *
   * An unset webhook secret must never mean "accept everything". This route
   * switches paid plans on and has no session behind it, so it is the one
   * place in the product where a missing variable has to be a closed door
   * rather than an open one.
   */
  if (!webhooksConfigured()) {
    console.error(
      "[razorpay] a webhook arrived and RAZORPAY_WEBHOOK_SECRET is not set, " +
        "so it cannot be verified and was refused. Payments confirmed in the " +
        "browser still work; payments whose browser went away are being lost.",
    );
    return plain("This endpoint is not configured.", 503);
  }
  if (!serviceKeyPresent()) {
    console.error(
      "[razorpay] a verified webhook could not be applied: " +
        "SUPABASE_SERVICE_ROLE_KEY is not set. Nothing was written.",
    );
    // 503 rather than 500: the provider retries, and a deploy that sets the
    // key will pick the backlog up rather than having dropped it.
    return plain("This endpoint is not configured.", 503);
  }

  /*
   * The raw bytes, before anything parses them.
   *
   * The signature is over the body exactly as sent. Reading `request.json()`
   * first and re-serialising would change whitespace and key order, and every
   * delivery would then fail to verify — with no symptom except a webhook that
   * never works.
   */
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";

  if (!verifyWebhookSignature(raw, signature, razorpayWebhookSecret())) {
    // No detail. Anything more specific tells whoever is probing which half
    // they got right.
    return plain("Not verified.", 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return plain("Not JSON.", 400);
  }

  const payment = paymentFromWebhook(body);
  // An event we do not act on — a refund, an authorisation, something added to
  // the product next year. Understood and dropped, with a 200 so it is not
  // redelivered for the next twenty-four hours.
  if (payment === null) return plain("Nothing to do.", 200);

  const settled = await settleOrder({
    orderId: payment.orderId,
    paymentId: payment.paymentId,
    amount: payment.amount,
    currency: payment.currency,
  });

  switch (settled.outcome) {
    case "activated":
      console.warn(
        `[razorpay] webhook settled ${payment.orderId}: ${settled.bought} is on.`,
      );
      return plain("Applied.", 200);

    case "unlocked":
      console.warn(
        `[razorpay] webhook settled ${payment.orderId}: the pass is on.`,
      );
      return plain("Applied.", 200);

    // The browser got back first, or this is a redelivery of a payment already
    // applied. Both are the normal case, not a fault: most of the time the
    // customer's own tab wins the race and this endpoint is the belt.
    case "already":
      return plain("Already applied.", 200);

    /*
     * Not an order of ours. Test deliveries from the dashboard land here, and
     * so does a live key pointed at a staging deployment. 200, because no
     * amount of retrying will make this order exist.
     */
    case "unknown":
      return plain("Not an order here.", 200);

    case "mismatch":
      console.error(
        `[razorpay] payment ${payment.paymentId} is ${String(settled.paid)} ` +
          `against an order for ${String(settled.asked)}. Nothing was applied ` +
          `and the order is still open. Look at this one by hand.`,
      );
      return plain("Amount does not match the order.", 200);

    case "failed":
      console.error(
        `[razorpay] could not settle ${payment.orderId}: ${settled.said}`,
      );
      // The one case where redelivery helps: the order was left open on the
      // way out, so the provider's retry finds it clean.
      return plain("Could not apply that. Please retry.", 500);
  }
}

/**
 * A GET to say the door is here.
 *
 * Somebody will paste this URL into a browser to check they typed it right,
 * and a 405 with no words does not answer that question. It says nothing
 * about whether the secret is set, because that is not a stranger's business.
 */
export function GET(): Response {
  return plain("Costbook payment callback. It answers to POST.", 200);
}

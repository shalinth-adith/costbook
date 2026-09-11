/**
 * The payment provider, behind two functions.
 *
 * Razorpay, because the subscriptions table has carried a column for it
 * since the first migration and it charges in the rupees the plan is priced
 * in. The shape is the standard one: the server creates an order, the
 * browser opens the provider's checkout on it, the provider hands back a
 * payment id and a signature, and the server checks the signature before
 * believing anything. Only the check matters for correctness; the rest is
 * plumbing that fails loudly.
 *
 * Configured by two variables, RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.
 * Without them there is no payment path, and the plans page says so instead
 * of pretending.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function razorpayConfigured(): boolean {
  return (
    (process.env.RAZORPAY_KEY_ID ?? "") !== "" &&
    (process.env.RAZORPAY_KEY_SECRET ?? "") !== ""
  );
}

export function razorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

export interface Order {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
}

/**
 * Ask the provider for an order to collect `amount` (in the smallest unit,
 * paise for rupees). The receipt is ours to recognise it by afterwards.
 */
export async function createOrder(input: {
  readonly amount: number;
  readonly currency: string;
  readonly receipt: string;
  readonly notes?: Readonly<Record<string, string>>;
}): Promise<Order> {
  const key = process.env.RAZORPAY_KEY_ID ?? "";
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes ?? {},
    }),
  });
  if (!res.ok) {
    throw new Error(
      `The payment provider would not open an order (${res.status}).`,
    );
  }
  const body = (await res.json()) as {
    id?: string;
    amount?: number;
    currency?: string;
  };
  if (typeof body.id !== "string")
    throw new Error("The payment provider answered without an order id.");
  return {
    id: body.id,
    amount: body.amount ?? input.amount,
    currency: body.currency ?? input.currency,
  };
}

/**
 * Whether a payment really came from the provider for this order.
 *
 * The provider signs `order_id|payment_id` with the secret; anyone can send
 * a payment id, only the provider can sign it. Compared in constant time,
 * because a comparison that stops at the first wrong byte leaks how many
 * were right.
 */
export function verifyPaymentSignature(
  input: {
    readonly orderId: string;
    readonly paymentId: string;
    readonly signature: string;
  },
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(input.signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ── webhooks ─────────────────────────────────────────────────────────────
 *
 * A second signature scheme, and it is not the one above.
 *
 * The callback the browser brings back is signed over `order_id|payment_id`
 * with the API secret. A webhook is signed over the WHOLE REQUEST BODY with a
 * SEPARATE webhook secret, set when the endpoint is registered in the
 * dashboard. Using either secret for the other's job fails every time, which
 * at least fails loudly — the quiet version is verifying the wrong bytes.
 */

export function razorpayWebhookSecret(): string {
  return process.env["RAZORPAY_WEBHOOK_SECRET"] ?? "";
}

export function webhooksConfigured(): boolean {
  return razorpayWebhookSecret() !== "";
}

/**
 * Whether this delivery really came from the provider.
 *
 * `rawBody` must be the bytes as they arrived. Parsing the JSON and
 * re-serialising it changes whitespace and key order, and the signature is
 * over the bytes — so a route that reads `request.json()` first can never
 * verify anything, and the only symptom is that every delivery is refused.
 *
 * An unset secret refuses rather than computing an HMAC with an empty key.
 * Without that guard a deployment that forgot the variable would accept
 * whatever anyone signed with "" — an unauthenticated route that switches
 * plans on, which is as bad as it sounds.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (secret === "" || signature === "") return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The part of a delivery that matters: which order, which payment, how much. */
export interface WebhookPayment {
  readonly event: string;
  readonly orderId: string;
  readonly paymentId: string;
  readonly amount: number;
  readonly currency: string;
}

/**
 * The payment out of a delivery, or null if this is not one we act on.
 *
 * Razorpay sends a dozen event types down one endpoint and will send more
 * next year. Only a captured payment moves an account, so everything else is
 * read and dropped — deliberately, and with a 200, because refusing an event
 * we simply do not care about makes the provider retry it for a day.
 *
 * Written against `unknown` rather than a declared payload type: this is the
 * one place in the product where the input is a stranger's JSON, and a cast
 * would be a promise about bytes nobody here controls.
 */
export function paymentFromWebhook(body: unknown): WebhookPayment | null {
  if (typeof body !== "object" || body === null) return null;
  const root = body as Record<string, unknown>;
  const event = typeof root["event"] === "string" ? root["event"] : "";
  // `order.paid` carries the same payment entity and arrives for the same
  // money; taking both means a captured payment is acted on whichever of the
  // two the dashboard happens to have subscribed to.
  if (event !== "payment.captured" && event !== "order.paid") return null;

  const payload = root["payload"];
  if (typeof payload !== "object" || payload === null) return null;
  const payment = (payload as Record<string, unknown>)["payment"];
  if (typeof payment !== "object" || payment === null) return null;
  const entity = (payment as Record<string, unknown>)["entity"];
  if (typeof entity !== "object" || entity === null) return null;

  const e = entity as Record<string, unknown>;
  const orderId = e["order_id"];
  const paymentId = e["id"];
  const amount = e["amount"];
  const currency = e["currency"];
  if (typeof orderId !== "string" || orderId === "") return null;
  if (typeof paymentId !== "string" || paymentId === "") return null;
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;

  return {
    event,
    orderId,
    paymentId,
    amount,
    currency: typeof currency === "string" ? currency : "",
  };
}

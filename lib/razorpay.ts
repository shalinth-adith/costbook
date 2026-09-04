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

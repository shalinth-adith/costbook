"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PAID_MONTHLY } from "@/lib/org";
import { activateSubscription, book } from "@/lib/book";
import { requireRole } from "@/lib/guard";
import { termOf, type Term } from "@/lib/plan";
import {
  createOrder,
  razorpayConfigured,
  razorpayKeyId,
  verifyPaymentSignature,
} from "@/lib/razorpay";

/**
 * Whether a stretch may be switched on without a payment.
 *
 * A named flag, not NODE_ENV: the local server here is a production build,
 * and a test path that only works under `next dev` is a test path nobody
 * runs. Set COSTBOOK_BILLING_SANDBOX=true and the plans page offers a
 * clearly labelled activation that records "sandbox" as its reference.
 * Never set it where real accounts live.
 */
function sandbox(): boolean {
  return process.env.COSTBOOK_BILLING_SANDBOX === "true";
}

export type Checkout =
  | {
      readonly mode: "razorpay";
      readonly orderId: string;
      readonly keyId: string;
      readonly amount: number;
      readonly currency: string;
      readonly name: string;
    }
  | { readonly mode: "sandbox" }
  | { readonly mode: "none" };

/**
 * Start buying a stretch. Writes nothing to the account; an order at the
 * provider is not a subscription until its payment is verified.
 */
export async function beginCheckout(termId: Term): Promise<Checkout> {
  await requireRole("billing");
  const term = termOf(termId);
  if (term === undefined) throw new Error("That is not a term Costbook sells.");
  if (razorpayConfigured()) {
    const b = await book();
    const order = await createOrder({
      amount: term.amount * 100,
      currency: PAID_MONTHLY.currency,
      receipt: `${b.orgId ?? "org"}:${term.id}:${Date.now().toString(36)}`,
      notes: { org: b.orgId ?? "", term: term.id },
    });
    return {
      mode: "razorpay",
      orderId: order.id,
      keyId: razorpayKeyId(),
      amount: order.amount,
      currency: order.currency,
      name: b.org.name,
    };
  }
  if (sandbox()) return { mode: "sandbox" };
  return { mode: "none" };
}

/** The provider says it was paid. Believe it only if the signature is the provider's. */
export async function confirmPayment(input: {
  readonly term: Term;
  readonly orderId: string;
  readonly paymentId: string;
  readonly signature: string;
}): Promise<never> {
  await requireRole("billing");
  const term = termOf(input.term);
  if (term === undefined) throw new Error("That is not a term Costbook sells.");
  if (!razorpayConfigured())
    throw new Error("There is no payment provider to confirm with.");
  const ok = verifyPaymentSignature(
    {
      orderId: input.orderId,
      paymentId: input.paymentId,
      signature: input.signature,
    },
    process.env.RAZORPAY_KEY_SECRET ?? "",
  );
  if (!ok)
    throw new Error(
      "That payment could not be verified. Nothing has changed on your account.",
    );
  await activateSubscription(term.id, `razorpay:${input.paymentId}`);
  revalidatePath("/", "layout");
  redirect("/plans?paid=1");
}

/** A stretch switched on with no payment, in the sandbox only. */
export async function activateSandbox(termId: Term): Promise<never> {
  await requireRole("billing");
  if (!sandbox())
    throw new Error(
      "The sandbox is off; a plan here is bought, not switched on.",
    );
  const term = termOf(termId);
  if (term === undefined) throw new Error("That is not a term Costbook sells.");
  await activateSubscription(term.id, "sandbox");
  revalidatePath("/", "layout");
  redirect("/plans?paid=1");
}

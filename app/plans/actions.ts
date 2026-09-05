"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { PAID_MONTHLY } from "@/lib/org";
import {
  activateSubscription,
  book,
  claimOrder,
  recordOrder,
} from "@/lib/book";
import { requireRole } from "@/lib/guard";
import { termOf, type Term } from "@/lib/plan";
import { sandboxAllowed } from "@/lib/sandbox";
import {
  createOrder,
  razorpayConfigured,
  razorpayKeyId,
  verifyPaymentSignature,
} from "@/lib/razorpay";

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

/** What a payment attempt says when it did not go through. Success navigates instead. */
export interface PaymentRefused {
  readonly ok: false;
  readonly message: string;
}

/**
 * Start buying a stretch. Writes nothing to the account; an order at the
 * provider is not a subscription until its payment is verified.
 *
 * The term and the amount are recorded against the order here, on the server,
 * and that record is what the confirmation reads. Nothing the browser says
 * afterwards can change what was bought.
 */
export async function beginCheckout(termId: Term): Promise<Checkout> {
  await requireRole("billing");
  const term = termOf(termId);
  if (term === undefined) throw new Error("That is not a term Costbook sells.");

  if (razorpayConfigured()) {
    const b = await book();
    const amount = term.amount * 100;
    const order = await createOrder({
      amount,
      currency: PAID_MONTHLY.currency,
      receipt: `${b.orgId ?? "org"}:${term.id}:${Date.now().toString(36)}`,
      notes: { org: b.orgId ?? "", term: term.id },
    });
    await recordOrder({
      id: order.id,
      term: term.id,
      amount,
      currency: PAID_MONTHLY.currency,
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

  if (await sandboxAllowed()) return { mode: "sandbox" };
  return { mode: "none" };
}

/**
 * The provider says it was paid.
 *
 * Three things have to hold, in this order: the signature is the provider's,
 * over this order and this payment; the order is one we opened and have not
 * already claimed; and the term is the one recorded against it, never the one
 * the caller sent. Claiming is a single conditional update, so two
 * confirmations of the same payment cannot both succeed.
 *
 * Returns a refusal rather than throwing, because a thrown error reaches a
 * browser as a redacted digest and the owner deserves the sentence.
 */
export async function confirmPayment(input: {
  readonly orderId: string;
  readonly paymentId: string;
  readonly signature: string;
}): Promise<PaymentRefused> {
  await requireRole("billing");
  if (!razorpayConfigured()) {
    return {
      ok: false,
      message: "There is no payment provider to confirm with.",
    };
  }

  const signed = verifyPaymentSignature(
    {
      orderId: input.orderId,
      paymentId: input.paymentId,
      signature: input.signature,
    },
    process.env["RAZORPAY_KEY_SECRET"] ?? "",
  );
  if (!signed) {
    return {
      ok: false,
      message:
        "That payment could not be verified against the provider. Nothing has " +
        "changed on your account, and nothing has been charged by Costbook.",
    };
  }

  const claimed = await claimOrder(input.orderId, input.paymentId);
  if (claimed === null) {
    return {
      ok: false,
      message:
        "That payment has already been applied, or the order is not one of " +
        "yours. Your plan is unchanged — reload the page to see where it stands.",
    };
  }

  // The term the server recorded when the order was opened, not the one the
  // browser sent with the confirmation.
  await activateSubscription(claimed.term, `razorpay:${input.paymentId}`);
  revalidatePath("/", "layout");
  redirect("/plans?paid=1");
}

/** A stretch switched on with no payment, in the sandbox only. */
export async function activateSandbox(termId: Term): Promise<PaymentRefused> {
  await requireRole("billing");
  if (!(await sandboxAllowed())) {
    return {
      ok: false,
      message: "A plan here is bought, not switched on.",
    };
  }
  const term = termOf(termId);
  if (term === undefined) {
    return { ok: false, message: "That is not a term Costbook sells." };
  }
  await activateSubscription(term.id, "sandbox");
  revalidatePath("/", "layout");
  redirect("/plans?paid=1");
}

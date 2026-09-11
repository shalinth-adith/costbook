"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { EXPORT_PASS, PAID_MONTHLY } from "@/lib/org";
import {
  activateSubscription,
  book,
  claimOrder,
  recordOrder,
  releaseOrder,
  unlockExports,
} from "@/lib/book";
import { requireRole } from "@/lib/guard";
import { canTakeAway, termOf, type Term } from "@/lib/plan";
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

/**
 * What the pass can answer, which is one thing more than a stretch can.
 *
 * A stretch is always buyable — another one stacks onto the end of the one
 * running. The pass is bought once and kept, so "you have this already" is a
 * real answer and only it can give it. Two types rather than one, so the
 * screen is made to handle that case by the compiler rather than by anybody
 * remembering to.
 */
export type PassCheckout = Checkout | { readonly mode: "held" };

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
  if (!claimed.ok) {
    if (claimed.why === "failed") {
      /*
       * The database, not the customer. Saying "already applied" here was a
       * lie told to somebody who had just paid — and it read as their
       * mistake. The provider has the money and the callback will settle it;
       * this sentence has to be the one that does not send them away.
       */
      console.error(
        `[payments] could not claim ${input.orderId} for ${input.paymentId}: ` +
          `${claimed.said ?? "no reason given"}`,
      );
      return {
        ok: false,
        message:
          "Your payment went through, but Costbook could not finish switching " +
          "it on just now. Nothing further will be charged. Reload in a moment " +
          "— it usually settles itself — and write to us if it has not.",
      };
    }
    return {
      ok: false,
      message:
        "That payment has already been applied, or the order is not one of " +
        "yours. Your plan is unchanged — reload the page to see where it stands.",
    };
  }

  /*
   * What the server recorded when the order was opened, never what the
   * browser sent with the confirmation. Two things can be bought here and
   * they are not interchangeable: a stretch of months moves the plan, and the
   * pass moves nothing except the right to take the work out.
   *
   * THE CLAIM GOES BACK IF THIS FAILS. Claiming and applying are two
   * statements with no transaction between them, and the gap used to end the
   * story: an order marked paid, an account still free, and a webhook that
   * would not touch it because a settled order is what it refuses to settle
   * twice. Releasing it leaves something that can still be finished.
   *
   * `redirect` stays outside the try. It signals by throwing, and Next's own
   * documentation says so in as many words — caught here it would be read as
   * a failure to apply, and the order would be released after it had worked.
   */
  try {
    if (claimed.term === "export") {
      await unlockExports(`razorpay:${input.paymentId}`);
    } else {
      await activateSubscription(claimed.term, `razorpay:${input.paymentId}`);
    }
  } catch (e) {
    await releaseOrder(input.orderId);
    console.error(
      `[payments] ${input.paymentId} paid for ${claimed.term} and it did not ` +
        `switch on; the order is open again. ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
    return {
      ok: false,
      message:
        "Your payment went through and Costbook could not switch it on. The " +
        "payment is recorded and nothing further will be charged — reload in a " +
        "moment, and write to us if it is still not on.",
    };
  }

  revalidatePath("/", "layout");
  redirect(claimed.term === "export" ? "/plans?took=1" : "/plans?paid=1");
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


/* ── the one-off pass ─────────────────────────────────────────────────────
 *
 * The same three steps as a stretch, and deliberately the same code path: an
 * order opened on the server with its amount recorded, a payment verified
 * against the provider's signature, and a claim that can only succeed once.
 * A second checkout written from scratch would be a second place for the
 * money to be wrong.
 *
 * `requireRole("billing")` guards all three. A manager cannot buy a pass for
 * an account, for the same reason a manager cannot see the bill (A27).
 */

/** Open an order for the pass. Writes nothing to the account. */
export async function beginExportPass(): Promise<PassCheckout> {
  await requireRole("billing");

  /*
   * Already bought is a refusal, not a second sale.
   *
   * The screen stops asking once the pass is held — but the export route two
   * files away says it plainly: a button hidden in the interface is not a
   * gate. Without this an account that already had the pass could open an
   * order for it, pay again, and get nothing, because `unlockExports` quite
   * correctly refuses to move a date that is already set. Charged twice for
   * one thing, by the part of the code that was being careful.
   */
  const held = await book();
  if (canTakeAway(held.subscription)) return { mode: "held" };

  if (razorpayConfigured()) {
    const b = await book();
    const amount = EXPORT_PASS.amount * 100;
    const order = await createOrder({
      amount,
      currency: EXPORT_PASS.currency,
      receipt: `${b.orgId ?? "org"}:export:${Date.now().toString(36)}`,
      notes: { org: b.orgId ?? "", term: "export" },
    });
    await recordOrder({
      id: order.id,
      term: "export",
      amount,
      currency: EXPORT_PASS.currency,
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

/** The pass switched on with no payment, in the sandbox only. */
export async function activateExportPassSandbox(): Promise<PaymentRefused> {
  await requireRole("billing");
  if (!(await sandboxAllowed())) {
    return { ok: false, message: "A pass here is bought, not switched on." };
  }
  await unlockExports("sandbox");
  revalidatePath("/", "layout");
  redirect("/plans?took=1");
}

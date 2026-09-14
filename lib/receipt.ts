import { dateSaid, moneySaid } from "./letters";
import { NO_GST_SAID, SELLER } from "./org";
import { type Purchase, termOf } from "./plan";

/**
 * The receipt for a payment.
 *
 * A receipt, and deliberately not an invoice: the seller is not registered
 * for GST, so there is no tax to itemise and nothing here may be titled "Tax
 * Invoice". Calling it one would claim a registration that does not exist,
 * which is a real problem for the person who files it as much as for us.
 *
 * WHAT IT IS FOR. Somebody who has paid for a stretch of months has to put a
 * document in their own books, and "check your email" is not a document. This
 * is one page, printable, reachable from the plans screen for as long as the
 * order exists, and it says exactly what was paid, for what, when, and against
 * which payment reference — the four things an accountant asks.
 *
 * EVERY FIGURE COMES FROM THE ORDER ROW. Not from the subscription as it
 * stands today: a receipt for a payment made in March must say what March
 * said, however many stretches have been bought since.
 */

export interface Receipt {
  /** What to quote when asking about this payment. */
  readonly reference: string;
  readonly paidOn: string;
  readonly seller: {
    readonly name: string;
    readonly address: string | null;
    readonly email: string;
  };
  readonly buyer: { readonly name: string; readonly email: string | null };
  readonly what: string;
  readonly amount: string;
  readonly paidWith: string;
  readonly note: string;
}

export interface OrderFacts {
  readonly id: string;
  readonly term: string;
  readonly amount: number;
  readonly currency: string;
  readonly paidAt: string | null;
  readonly paymentId: string | null;
}

/** How a term reads on a document somebody files. */
export function whatWasBought(term: string): string {
  const t = termOf(term as Purchase);
  if (t !== undefined) {
    return `Costbook — the paid plan, ${t.label.toLowerCase()}`;
  }
  if (term === "export") return "Costbook — the export pass, bought once";
  // An unknown term is still a payment that happened; the receipt says what
  // it can rather than refusing to exist.
  return "Costbook — a payment";
}

export function receiptOf(input: {
  readonly order: OrderFacts;
  readonly orgName: string;
  readonly buyerEmail: string | null;
}): Receipt {
  const { order } = input;
  return {
    reference: order.id,
    paidOn: order.paidAt === null ? "—" : dateSaid(order.paidAt),
    seller: { name: SELLER.name, address: SELLER.address, email: SELLER.email },
    buyer: { name: input.orgName, email: input.buyerEmail },
    what: whatWasBought(order.term),
    amount: moneySaid(order.amount, order.currency),
    paidWith:
      order.paymentId === null
        ? "Razorpay"
        : `Razorpay · ${order.paymentId}`,
    note: NO_GST_SAID,
  };
}

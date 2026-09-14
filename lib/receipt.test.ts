import { describe, expect, it } from "vitest";

import { termOf } from "./plan";
import { receiptOf, whatWasBought } from "./receipt";

/**
 * A document somebody files. What matters is that it does not claim to be
 * something it is not, and that it reports the payment that happened rather
 * than the plan as it stands today.
 */

const order = {
  id: "order_RQxyz",
  term: "quarter",
  amount: 149_700,
  currency: "INR",
  paidAt: "2026-09-14T10:02:00.000Z",
  paymentId: "pay_RQabc",
};

describe("what it says it is", () => {
  const r = receiptOf({ order, orgName: "Dev Kitchen", buyerEmail: "owner@kitchen.test" });

  it("never calls itself a tax invoice, and says why there is no tax", () => {
    /*
     * The seller is not registered for GST. A document titled "Tax Invoice",
     * or one that simply omits the tax line without a word, both mislead the
     * person filing it — in opposite directions.
     */
    expect(r.note).toMatch(/not registered for GST/i);
    expect(JSON.stringify(r)).not.toMatch(/tax invoice/i);
  });

  it("carries the four things an accountant asks", () => {
    expect(r.amount).toBe("₹1,497");
    expect(r.paidOn).toBe("14 September 2026");
    expect(r.what).toMatch(/three months/i);
    expect(r.reference).toBe("order_RQxyz");
    expect(r.paidWith).toContain("pay_RQabc");
  });

  it("names both sides", () => {
    expect(r.buyer.name).toBe("Dev Kitchen");
    expect(r.buyer.email).toBe("owner@kitchen.test");
    expect(r.seller.name).not.toBe("");
  });

  it("prints no address rather than an invented one", () => {
    // Until a registered address exists, the field is null and the page
    // prints nothing — a plausible address belonging to nobody is worse
    // than none on a document about money.
    expect(r.seller.address).toBeNull();
  });
});

describe("what was bought", () => {
  it("reads a term in the same words the plans page sold it in", () => {
    /*
     * Not "1 month" against "A month". Somebody comparing the receipt to the
     * screen they bought from should not have to work out that the two say
     * the same thing, so the label comes from the same table both times.
     */
    for (const term of ["monthly", "quarter", "half", "year"] as const) {
      const label = termOf(term)?.label ?? "";
      expect(label).not.toBe("");
      expect(whatWasBought(term)).toContain(label.toLowerCase());
    }
  });

  it("names the pass, which is not a stretch of months", () => {
    expect(whatWasBought("export")).toMatch(/export pass/i);
  });

  it("still produces a receipt for a term it does not recognise", () => {
    expect(whatWasBought("something_else")).toMatch(/a payment/i);
  });
});

describe("an order that was never paid", () => {
  it("says so rather than inventing a date", () => {
    const r = receiptOf({
      order: { ...order, paidAt: null, paymentId: null },
      orgName: "K",
      buyerEmail: null,
    });
    expect(r.paidOn).toBe("—");
    expect(r.paidWith).toBe("Razorpay");
  });
});

import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyPaymentSignature } from "./razorpay";

describe("verifyPaymentSignature", () => {
  const secret = "test-secret";
  const sign = (orderId: string, paymentId: string) =>
    createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

  it("accepts a signature the secret produced for this order and payment", () => {
    const signature = sign("order_1", "pay_1");
    expect(
      verifyPaymentSignature(
        { orderId: "order_1", paymentId: "pay_1", signature },
        secret,
      ),
    ).toBe(true);
  });

  it("refuses a signature for another payment, another order, or another secret", () => {
    const signature = sign("order_1", "pay_1");
    expect(
      verifyPaymentSignature(
        { orderId: "order_1", paymentId: "pay_2", signature },
        secret,
      ),
    ).toBe(false);
    expect(
      verifyPaymentSignature(
        { orderId: "order_2", paymentId: "pay_1", signature },
        secret,
      ),
    ).toBe(false);
    expect(
      verifyPaymentSignature(
        { orderId: "order_1", paymentId: "pay_1", signature },
        "other",
      ),
    ).toBe(false);
  });

  it("refuses garbage without throwing", () => {
    expect(
      verifyPaymentSignature(
        { orderId: "order_1", paymentId: "pay_1", signature: "" },
        secret,
      ),
    ).toBe(false);
    expect(
      verifyPaymentSignature(
        { orderId: "order_1", paymentId: "pay_1", signature: "nope" },
        secret,
      ),
    ).toBe(false);
  });
});

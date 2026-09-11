import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { paymentFromWebhook, verifyWebhookSignature } from "./razorpay";

/**
 * The door the provider knocks on.
 *
 * Everything here is about refusing: this is the one route in the product
 * that switches a paid plan on with nobody signed in, so the interesting
 * cases are all the ways in it that must not open.
 */

const SECRET = "a-webhook-secret";
const sign = (body: string) =>
  createHmac("sha256", SECRET).update(body, "utf8").digest("hex");

const delivery = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_1",
          order_id: "order_1",
          amount: 10_000,
          currency: "INR",
          status: "captured",
          ...over,
        },
      },
    },
  });

describe("verifyWebhookSignature", () => {
  it("accepts the body the secret actually signed", () => {
    const body = delivery();
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("refuses a body changed by one character after signing", () => {
    // The point of signing the whole body: an amount edited in flight has to
    // fail, not arrive looking official.
    const body = delivery();
    const signature = sign(body);
    const tampered = body.replace('"amount":10000', '"amount":100');
    expect(tampered).not.toBe(body);
    expect(verifyWebhookSignature(tampered, signature, SECRET)).toBe(false);
  });

  it("refuses re-serialised JSON, which is why the raw bytes are kept", () => {
    // JSON.parse then JSON.stringify is the mistake this guards: it produces
    // the same data and different bytes, and the signature is over bytes.
    const body = `{ "event": "payment.captured",  "payload": {} }`;
    const resaved = JSON.stringify(JSON.parse(body) as unknown);
    expect(resaved).not.toBe(body);
    expect(verifyWebhookSignature(resaved, sign(body), SECRET)).toBe(false);
  });

  it("refuses another secret", () => {
    const body = delivery();
    expect(verifyWebhookSignature(body, sign(body), "other")).toBe(false);
  });

  it("refuses when no secret is configured, rather than signing with nothing", () => {
    /*
     * The failure this prevents is the whole endpoint. With an empty secret an
     * HMAC is still perfectly computable, so a deployment that forgot the
     * variable would accept anything signed with "" — a public URL that turns
     * plans on. It must be a closed door, never an open one.
     */
    const body = delivery();
    const withEmpty = createHmac("sha256", "").update(body).digest("hex");
    expect(verifyWebhookSignature(body, withEmpty, "")).toBe(false);
  });

  it("refuses a missing or malformed signature header without throwing", () => {
    const body = delivery();
    expect(verifyWebhookSignature(body, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "nope", SECRET)).toBe(false);
    // Right length, wrong bytes: the constant-time compare must still refuse.
    expect(verifyWebhookSignature(body, "0".repeat(64), SECRET)).toBe(false);
  });
});

describe("paymentFromWebhook", () => {
  it("reads the order, the payment and the amount out of a capture", () => {
    expect(paymentFromWebhook(JSON.parse(delivery()) as unknown)).toEqual({
      event: "payment.captured",
      orderId: "order_1",
      paymentId: "pay_1",
      amount: 10_000,
      currency: "INR",
    });
  });

  it("takes order.paid as well, so either subscription is enough", () => {
    const body = JSON.parse(delivery()) as Record<string, unknown>;
    body["event"] = "order.paid";
    expect(paymentFromWebhook(body)?.orderId).toBe("order_1");
  });

  it("ignores every other event rather than refusing it", () => {
    // A refund or an authorisation is understood and dropped. Answering
    // anything but 200 to those makes the provider redeliver them for a day.
    for (const event of ["payment.failed", "refund.created", "invented.later"]) {
      const body = JSON.parse(delivery()) as Record<string, unknown>;
      body["event"] = event;
      expect(paymentFromWebhook(body)).toBeNull();
    }
  });

  it("survives anything at all, because the body is a stranger's JSON", () => {
    for (const junk of [null, undefined, 0, "", "{}", [], { event: 1 }]) {
      expect(paymentFromWebhook(junk)).toBeNull();
    }
    expect(paymentFromWebhook({ event: "payment.captured" })).toBeNull();
    expect(
      paymentFromWebhook({ event: "payment.captured", payload: { payment: {} } }),
    ).toBeNull();
  });

  it("refuses an entity missing the ids it exists to carry", () => {
    const without = (key: string) => {
      const body = JSON.parse(delivery()) as Record<string, unknown>;
      const payload = body["payload"] as Record<string, unknown>;
      const payment = payload["payment"] as Record<string, unknown>;
      delete (payment["entity"] as Record<string, unknown>)[key];
      return paymentFromWebhook(body);
    };
    expect(without("order_id")).toBeNull();
    expect(without("id")).toBeNull();
    expect(without("amount")).toBeNull();
  });

  it("refuses an amount that is not a number", () => {
    // "10000" would compare unequal to the recorded 10000 and be read as a
    // mismatch, which is safe — but refusing it here says why.
    const body = JSON.parse(delivery({ amount: "10000" })) as unknown;
    expect(paymentFromWebhook(body)).toBeNull();
  });
});

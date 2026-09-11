import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Settlement } from "./settle";

/**
 * The route handler itself, called the way Next calls it.
 *
 * The pieces are tested next door; this is about the door. What matters is
 * which requests get through it, what it answers, and — the part that is easy
 * to get wrong and impossible to notice — WHICH STATUS it answers with. A
 * non-2xx makes the provider redeliver for twenty-four hours, so answering
 * "failed" to an event we simply do not care about turns one ignored refund
 * into a day of retries.
 */

const SECRET = "webhook-secret-for-the-test";
let settlement: Settlement = { outcome: "already" };
const settle = vi.fn(async (): Promise<Settlement> => settlement);

vi.mock("./settle", () => ({ settleOrder: settle }));

const { POST, GET } = await import("@/app/api/razorpay/webhook/route");

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_1",
          order_id: "order_1",
          amount: 10_000,
          currency: "INR",
          ...over,
        },
      },
    },
  });

const post = (raw: string, signature?: string) =>
  POST(
    new Request("https://costbook.in/api/razorpay/webhook", {
      method: "POST",
      headers:
        signature === undefined
          ? {}
          : { "x-razorpay-signature": signature, "content-type": "application/json" },
      body: raw,
    }),
  );

const sign = (raw: string) =>
  createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");

beforeEach(() => {
  vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  settle.mockClear();
  settlement = { outcome: "already" };
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("the door", () => {
  it("is shut when no webhook secret is configured", async () => {
    /*
     * The one that matters most. An unset secret must never mean "accept
     * everything": this is a public URL with no session behind it that turns
     * paid plans on.
     */
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "");
    const raw = body();
    const res = await post(raw, sign(raw));
    expect(res.status).toBe(503);
    expect(settle).not.toHaveBeenCalled();
  });

  it("is shut when the callback could not write even if it verified", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const raw = body();
    const res = await post(raw, sign(raw));
    // 503 rather than 500, so the provider retries and a deploy that sets the
    // key picks the backlog up instead of having dropped it.
    expect(res.status).toBe(503);
    expect(settle).not.toHaveBeenCalled();
  });

  it("refuses an unsigned delivery", async () => {
    expect((await post(body())).status).toBe(401);
    expect(settle).not.toHaveBeenCalled();
  });

  it("refuses a delivery signed with the wrong secret", async () => {
    const raw = body();
    const wrong = createHmac("sha256", "not-it").update(raw).digest("hex");
    expect((await post(raw, wrong)).status).toBe(401);
    expect(settle).not.toHaveBeenCalled();
  });

  it("refuses a body edited after it was signed", async () => {
    const raw = body();
    const signature = sign(raw);
    const tampered = raw.replace('"amount":10000', '"amount":1');
    expect((await post(tampered, signature)).status).toBe(401);
    expect(settle).not.toHaveBeenCalled();
  });

  it("says nothing about which check failed", async () => {
    // Anything more specific tells whoever is probing which half they got right.
    const raw = body();
    const a = await (await post(raw, "nope")).text();
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", SECRET);
    const b = await (await post(raw, "0".repeat(64))).text();
    expect(a).toBe(b);
    expect(a).not.toContain("secret");
  });

  it("refuses a signed body that is not JSON", async () => {
    const raw = "not json at all";
    expect((await post(raw, sign(raw))).status).toBe(400);
  });
});

describe("what it answers once it is through", () => {
  const through = async (outcome: Settlement) => {
    settlement = outcome;
    const raw = body();
    return post(raw, sign(raw));
  };

  it("200 for a payment it applied", async () => {
    const res = await through({ outcome: "activated", bought: "year", orgId: "org-a" });
    expect(res.status).toBe(200);
    expect(settle).toHaveBeenCalledWith({
      orderId: "order_1",
      paymentId: "pay_1",
      amount: 10_000,
      currency: "INR",
    });
  });

  it("200 for the pass", async () => {
    expect((await through({ outcome: "unlocked", orgId: "org-a" })).status).toBe(200);
  });

  it("200 for a payment the browser already applied", async () => {
    // The common case, not a fault: most of the time the customer's own tab
    // wins the race and this endpoint is the belt.
    expect((await through({ outcome: "already" })).status).toBe(200);
  });

  it("200 for an order that was never opened here", async () => {
    // A test delivery from the dashboard, or a live key pointed at staging.
    // No amount of retrying will make that order exist.
    expect((await through({ outcome: "unknown" })).status).toBe(200);
  });

  it("200 for a wrong amount, and says so where somebody will read it", async () => {
    const res = await through({ outcome: "mismatch", asked: 720_000, paid: 100 });
    expect(res.status).toBe(200);
    expect(console.error).toHaveBeenCalled();
  });

  it("500 only when a retry could actually help", async () => {
    const res = await through({ outcome: "failed", said: "connection lost" });
    expect(res.status).toBe(500);
  });

  it("200 and no settling for an event it does not act on", async () => {
    const raw = JSON.stringify({ event: "refund.created", payload: {} });
    const res = await post(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(settle).not.toHaveBeenCalled();
  });
});

describe("a person checking the URL", () => {
  it("answers a GET with a sentence rather than a bare 405", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const said = await res.text();
    expect(said).toContain("POST");
    // And nothing about whether it is configured — not a stranger's business.
    expect(said).not.toMatch(/secret|key/i);
  });
});

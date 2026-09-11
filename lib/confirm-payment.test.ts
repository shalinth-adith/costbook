import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Claim } from "./book";

/**
 * The browser coming back from checkout.
 *
 * The webhook's own settling is tested next door. This is the other path to
 * the same money, and what it has to get right is what happens when the two
 * statements behind a purchase do not both land: the order must not be left
 * saying paid while the account says free, because a settled order is exactly
 * what the webhook refuses to touch again.
 */

const claim = vi.fn<() => Promise<Claim>>();
const release = vi.fn(async () => undefined);
const activate = vi.fn(async () => undefined);
const unlock = vi.fn(async () => undefined);
const subscription = { exportsUnlockedAt: null as string | null, plan: "free" };

vi.mock("./book", () => ({
  claimOrder: claim,
  releaseOrder: release,
  activateSubscription: activate,
  unlockExports: unlock,
  recordOrder: vi.fn(async () => undefined),
  book: async () => ({
    orgId: "org-a",
    org: { name: "Dev Kitchen", currency: "AED" },
    plan: subscription.plan,
    subscription: {
      plan: subscription.plan,
      status: "active",
      term: null,
      startedAt: null,
      periodEnd: null,
      reference: null,
      exportsUnlockedAt: subscription.exportsUnlockedAt,
    },
  }),
}));
vi.mock("./guard", () => ({ requireRole: async () => "owner" }));
vi.mock("./sandbox", () => ({ sandboxAllowed: async () => false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/** `redirect` signals by throwing, and the test has to behave like it does. */
class Redirected extends Error {
  readonly digest: string;
  constructor(readonly to: string) {
    super("NEXT_REDIRECT");
    this.digest = `NEXT_REDIRECT;replace;${to};307;`;
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

const { confirmPayment, beginExportPass } = await import("@/app/plans/actions");

/** Where it redirected to, or null if it returned a refusal instead. */
async function went(): Promise<{ to: string | null; message: string | null }> {
  try {
    const refused = await confirmPayment({
      orderId: "order_1",
      paymentId: "pay_1",
      signature: signatureFor("order_1", "pay_1"),
    });
    return { to: null, message: refused.message };
  } catch (e) {
    if (e instanceof Redirected) return { to: e.to, message: null };
    throw e;
  }
}

function signatureFor(orderId: string, paymentId: string): string {
  // The real one, against the secret stubbed below — a test that signed with
  // the wrong key would pass for the wrong reason.
  return createHmac("sha256", "test-secret")
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

beforeEach(() => {
  vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_x");
  vi.stubEnv("RAZORPAY_KEY_SECRET", "test-secret");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  claim.mockReset();
  release.mockReset();
  activate.mockReset();
  unlock.mockReset();
  subscription.exportsUnlockedAt = null;
  subscription.plan = "free";
});

describe("a payment that goes through", () => {
  it("switches a stretch on and sends them to the receipt", async () => {
    claim.mockResolvedValue({ ok: true, term: "quarter", amount: 210_000 });
    expect(await went()).toEqual({ to: "/plans?paid=1", message: null });
    expect(activate).toHaveBeenCalledWith("quarter", "razorpay:pay_1");
    expect(release).not.toHaveBeenCalled();
  });

  it("unlocks the pass and sends them somewhere else", async () => {
    claim.mockResolvedValue({ ok: true, term: "export", amount: 10_000 });
    expect(await went()).toEqual({ to: "/plans?took=1", message: null });
    expect(unlock).toHaveBeenCalledWith("razorpay:pay_1");
    expect(activate).not.toHaveBeenCalled();
  });

  it("acts on what the server recorded, never on what the browser sent", async () => {
    // The provider signs the order and the payment — not the amount and not
    // the term. The term comes off the claimed row or it is worthless.
    claim.mockResolvedValue({ ok: true, term: "year", amount: 720_000 });
    await went();
    expect(activate).toHaveBeenCalledWith("year", "razorpay:pay_1");
  });
});

describe("when what was paid for will not switch on", () => {
  it("puts the claim back rather than leaving an order that says paid", async () => {
    /*
     * The state this prevents is the worst one available: the order settled,
     * the account still free, and the webhook declining to help because a
     * settled order is what it refuses to settle twice. Money taken, nothing
     * given, and nothing left that would ever notice.
     */
    claim.mockResolvedValue({ ok: true, term: "quarter", amount: 210_000 });
    activate.mockRejectedValue(new Error("could not write your plan"));

    const res = await went();
    expect(res.to).toBeNull();
    expect(release).toHaveBeenCalledWith("order_1");
    expect(res.message).toContain("payment went through");
    // And it does not tell them nothing was charged, because something was.
    expect(res.message).not.toMatch(/nothing has been charged/i);
  });

  it("puts it back for the pass too", async () => {
    claim.mockResolvedValue({ ok: true, term: "export", amount: 10_000 });
    unlock.mockRejectedValue(new Error("could not write the pass"));
    expect((await went()).to).toBeNull();
    expect(release).toHaveBeenCalledWith("order_1");
  });

  it("does not release an order after a redirect, which is how success is said", async () => {
    // `redirect` throws. Inside the try it would read as a failure to apply,
    // and the order would be released after it had worked.
    claim.mockResolvedValue({ ok: true, term: "quarter", amount: 210_000 });
    expect((await went()).to).toBe("/plans?paid=1");
    expect(release).not.toHaveBeenCalled();
  });
});

describe("refusals, told apart", () => {
  it("says the database gave way rather than blaming the payer", async () => {
    claim.mockResolvedValue({ ok: false, why: "failed", said: "timeout" });
    const res = await went();
    expect(res.message).toContain("payment went through");
    // The old sentence said "already applied", to somebody who had just paid
    // and to whom nothing had been applied at all.
    expect(res.message).not.toMatch(/already been applied/i);
    expect(console.error).toHaveBeenCalled();
  });

  it("still says already applied when it truly was", async () => {
    claim.mockResolvedValue({ ok: false, why: "taken", said: null });
    expect((await went()).message).toMatch(/already been applied/i);
  });

  it("refuses a signature that is not the provider's, before touching anything", async () => {
    const refused = await confirmPayment({
      orderId: "order_1",
      paymentId: "pay_1",
      signature: "forged",
    });
    expect(refused.message).toContain("could not be verified");
    expect(claim).not.toHaveBeenCalled();
  });
});

describe("the pass, which is bought once", () => {
  it("refuses to sell it to an account that already has it", async () => {
    /*
     * The screen stops offering it, but a hidden button is not a gate. Paying
     * again would take the money and change nothing, because unlockExports
     * quite correctly will not move a date that is already set.
     */
    subscription.exportsUnlockedAt = "2026-01-01T00:00:00.000Z";
    expect(await beginExportPass()).toEqual({ mode: "held" });
  });

  it("refuses it to an account on a plan, which already includes it", async () => {
    subscription.plan = "paid";
    expect(await beginExportPass()).toEqual({ mode: "held" });
  });
});

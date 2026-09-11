import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Applying a payment with nobody signed in.
 *
 * The database is stood in for, because what needs proving here is not that
 * PostgREST works — it is what happens when two deliveries of one payment
 * race, when the second statement fails after the first has landed, and when
 * somebody pays the wrong amount. None of those are reachable by asking a
 * real database nicely.
 */

interface OrderRow {
  id: string;
  org_id: string;
  term: string;
  amount: number;
  currency: string;
  status: string;
  payment_id: string | null;
  paid_at: string | null;
}

interface SubRow {
  org_id: string;
  plan: string;
  status: string;
  term: string | null;
  started_at: string | null;
  current_period_end: string | null;
  provider_reference: string | null;
  exports_unlocked_at: string | null;
}

const db = {
  orders: new Map<string, OrderRow>(),
  subs: new Map<string, SubRow>(),
  /** Made to fail on purpose: table+op -> the message the database would give. */
  breaks: new Map<string, string>(),
  /** Runs after a claim lands, to simulate a second delivery arriving mid-flight. */
  afterClaim: null as null | (() => void),
};

class Chain implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: [string, unknown][] = [];
  constructor(
    private table: string,
    private op: "select" | "update",
    private values: Record<string, unknown> | null,
  ) {}

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }
  select(): this {
    return this;
  }
  async maybeSingle() {
    const res = this.exec();
    return { data: (res.data as unknown[])[0] ?? null, error: res.error };
  }
  then<R1, R2 = never>(
    ok?: ((v: { data: unknown; error: { message: string } | null }) => R1 | PromiseLike<R1>) | null,
    bad?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.exec()).then(ok, bad);
  }

  private exec(): { data: unknown[]; error: { message: string } | null } {
    const broken = db.breaks.get(`${this.table}.${this.op}`);
    if (broken !== undefined) return { data: [], error: { message: broken } };

    const rows: (OrderRow | SubRow)[] =
      this.table === "payment_orders"
        ? [...db.orders.values()]
        : [...db.subs.values()];
    const hit = rows.filter((r) =>
      this.filters.every(([c, v]) => (r as unknown as Record<string, unknown>)[c] === v),
    );

    if (this.op === "select") return { data: hit, error: null };

    // A second order already carrying this payment id is the unique index.
    const paying = this.values?.["payment_id"];
    if (typeof paying === "string") {
      const taken = [...db.orders.values()].some(
        (o) => o.payment_id === paying && !hit.includes(o),
      );
      if (taken) {
        return { data: [], error: { message: "duplicate key value: payment_id" } };
      }
    }
    for (const row of hit) Object.assign(row, this.values);
    if (this.table === "payment_orders" && this.values?.["status"] === "paid") {
      db.afterClaim?.();
    }
    return { data: hit, error: null };
  }
}

vi.mock("./supabase/admin", () => ({
  serviceKeyPresent: () => true,
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => new Chain(table, "select", null),
      update: (values: Record<string, unknown>) => new Chain(table, "update", values),
    }),
  }),
}));

const { settleOrder } = await import("./settle");

const NOW = new Date("2026-09-11T10:00:00.000Z");

function order(over: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "order_1",
    org_id: "org-a",
    term: "monthly",
    amount: 90_000,
    currency: "INR",
    status: "open",
    payment_id: null,
    paid_at: null,
    ...over,
  };
}
function sub(over: Partial<SubRow> = {}): SubRow {
  return {
    org_id: "org-a",
    plan: "free",
    status: "active",
    term: null,
    started_at: null,
    current_period_end: null,
    provider_reference: null,
    exports_unlocked_at: null,
    ...over,
  };
}
const pay = (over: Partial<{ amount: number; currency: string; paymentId: string }> = {}) => ({
  orderId: "order_1",
  paymentId: over.paymentId ?? "pay_1",
  amount: over.amount ?? 90_000,
  currency: over.currency ?? "INR",
});

beforeEach(() => {
  db.orders.clear();
  db.subs.clear();
  db.breaks.clear();
  db.afterClaim = null;
});

describe("a payment that should be applied", () => {
  it("switches a stretch on and dates it from today", async () => {
    db.orders.set("order_1", order());
    db.subs.set("org-a", sub());

    const res = await settleOrder(pay(), NOW);
    expect(res).toEqual({ outcome: "activated", bought: "monthly", orgId: "org-a" });

    const row = db.subs.get("org-a");
    expect(row?.plan).toBe("paid");
    expect(row?.term).toBe("monthly");
    expect(row?.started_at).toBe(NOW.toISOString());
    expect(row?.current_period_end).toBe(new Date("2026-10-11T10:00:00.000Z").toISOString());
    expect(row?.provider_reference).toBe("razorpay:pay_1");
    // A stretch also buys carrying the work out, and keeps it afterwards.
    expect(row?.exports_unlocked_at).toBe(NOW.toISOString());
    expect(db.orders.get("order_1")?.status).toBe("paid");
  });

  it("starts a new stretch where the running one ends, not today", async () => {
    // The failure this prevents: paying for a second year and losing the
    // eleven months still on the first.
    db.orders.set("order_1", order({ term: "year", amount: 720_000 }));
    db.subs.set(
      "org-a",
      sub({ plan: "paid", current_period_end: "2026-12-01T10:00:00.000Z" }),
    );

    await settleOrder(pay({ amount: 720_000 }), NOW);
    expect(db.subs.get("org-a")?.started_at).toBe("2026-12-01T10:00:00.000Z");
    expect(db.subs.get("org-a")?.current_period_end).toBe("2027-12-01T10:00:00.000Z");
  });

  it("unlocks the pass and leaves the plan alone", async () => {
    db.orders.set("order_1", order({ term: "export", amount: 10_000 }));
    db.subs.set("org-a", sub());

    const res = await settleOrder(pay({ amount: 10_000 }), NOW);
    expect(res).toEqual({ outcome: "unlocked", orgId: "org-a" });

    const row = db.subs.get("org-a");
    expect(row?.exports_unlocked_at).toBe(NOW.toISOString());
    // What was bought is carrying the work away — nothing else moves.
    expect(row?.plan).toBe("free");
    expect(row?.term).toBeNull();
  });

  it("does not move the date the pass was first earned", async () => {
    db.orders.set("order_1", order({ term: "monthly" }));
    db.subs.set("org-a", sub({ exports_unlocked_at: "2026-01-01T00:00:00.000Z" }));

    await settleOrder(pay(), NOW);
    expect(db.subs.get("org-a")?.exports_unlocked_at).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("what it refuses to apply twice", () => {
  it("refuses an order already settled", async () => {
    db.orders.set("order_1", order({ status: "paid", payment_id: "pay_1" }));
    db.subs.set("org-a", sub());
    expect(await settleOrder(pay(), NOW)).toEqual({ outcome: "already" });
  });

  it("refuses a redelivery that lands while the first is still in flight", async () => {
    // The race the conditional update exists for: two deliveries of one
    // payment, or a delivery against the browser coming back from checkout.
    db.orders.set("order_1", order());
    db.subs.set("org-a", sub());
    db.afterClaim = () => {
      db.afterClaim = null;
    };

    const first = await settleOrder(pay(), NOW);
    const second = await settleOrder(pay(), NOW);
    expect(first.outcome).toBe("activated");
    expect(second).toEqual({ outcome: "already" });
    // One stretch, not two stacked on each other.
    expect(db.subs.get("org-a")?.current_period_end).toBe("2026-10-11T10:00:00.000Z");
  });

  it("reads the unique payment id as already applied, not as a fault", async () => {
    db.orders.set("order_1", order());
    db.orders.set("order_2", order({ id: "order_2", status: "paid", payment_id: "pay_1" }));
    db.subs.set("org-a", sub());
    expect(await settleOrder(pay(), NOW)).toEqual({ outcome: "already" });
  });
});

describe("what it will not touch", () => {
  it("does not know an order that was never opened here", async () => {
    // A test delivery from the dashboard, or a live key pointed at staging.
    expect(await settleOrder(pay(), NOW)).toEqual({ outcome: "unknown" });
  });

  it("refuses a part payment and leaves the order open", async () => {
    /*
     * The provider allows an order to be part-paid, and a partial capture
     * arrives looking like any other payment. Honouring one would sell a year
     * of Costbook for whatever the payer felt like sending.
     */
    db.orders.set("order_1", order({ amount: 720_000 }));
    db.subs.set("org-a", sub());

    expect(await settleOrder(pay({ amount: 10_000 }), NOW)).toEqual({
      outcome: "mismatch",
      asked: 720_000,
      paid: 10_000,
    });
    expect(db.orders.get("order_1")?.status).toBe("open");
    expect(db.subs.get("org-a")?.plan).toBe("free");
  });

  it("refuses a payment in another currency", async () => {
    db.orders.set("order_1", order());
    db.subs.set("org-a", sub());
    const res = await settleOrder(pay({ currency: "USD" }), NOW);
    expect(res.outcome).toBe("mismatch");
    expect(db.orders.get("order_1")?.status).toBe("open");
  });
});

describe("when the database gives way mid-flight", () => {
  it("puts the claim back if the plan cannot be switched on", async () => {
    /*
     * Two statements and no transaction between them. Claimed-but-not-applied
     * is the exact bug this whole route exists to prevent, one step further
     * along — so the claim is undone and the provider is asked to retry.
     */
    db.orders.set("order_1", order());
    db.subs.set("org-a", sub());
    db.afterClaim = () => db.breaks.set("subscriptions.update", "connection lost");

    const res = await settleOrder(pay(), NOW);
    expect(res.outcome).toBe("failed");

    const row = db.orders.get("order_1");
    expect(row?.status).toBe("open");
    expect(row?.payment_id).toBeNull();
    expect(row?.paid_at).toBeNull();
    expect(db.subs.get("org-a")?.plan).toBe("free");
  });

  it("refuses rather than guessing when the order cannot be read", async () => {
    db.breaks.set("payment_orders.select", "statement timeout");
    expect((await settleOrder(pay(), NOW)).outcome).toBe("failed");
  });

  it("refuses an account with no subscription row instead of writing nothing", async () => {
    db.orders.set("order_1", order({ org_id: "org-missing" }));
    const res = await settleOrder(pay(), NOW);
    expect(res.outcome).toBe("failed");
    // And the order goes back to open, so a retry can still work.
    expect(db.orders.get("order_1")?.status).toBe("open");
  });

  it("refuses an order for something Costbook does not sell", async () => {
    db.orders.set("order_1", order({ term: "lifetime" }));
    db.subs.set("org-a", sub());
    expect((await settleOrder(pay(), NOW)).outcome).toBe("failed");
    expect(db.orders.get("order_1")?.status).toBe("open");
  });
});

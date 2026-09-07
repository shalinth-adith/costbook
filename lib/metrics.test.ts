import { describe, expect, it } from "vitest";

import {
  type AccountRow,
  type PaidOrder,
  costedButNeverMoved,
  funnelOf,
  importReach,
  renewingWithin,
  revenueOf,
  movedWhen,
  signupsByMonth,
  stuckBeforeImport,
  whatIsHeld,
} from "./metrics";

/**
 * The numbers decisions get made on. A wrong one here is worse than a missing
 * one, so the arithmetic is asserted rather than eyeballed on a console.
 */
const acc = (p: Partial<AccountRow> & { orgId: string }): AccountRow => ({
  name: p.orgId,
  createdAt: "2026-09-01T00:00:00Z",
  setupDone: false,
  ownerEmail: `${p.orgId}@costbook.test`,
  plan: "free",
  status: "active",
  periodEnd: null,
  recipes: 0,
  ingredients: 0,
  lastRateAt: null,
  imports: 0,
  ...p,
});

describe("the funnel from FLOWS 10", () => {
  const rows = [
    acc({ orgId: "a" }), // signed up, nothing else
    acc({ orgId: "b", setupDone: true }), // answered the questions
    acc({ orgId: "c", setupDone: true, recipes: 4 }), // has a book
    acc({ orgId: "d", setupDone: true, recipes: 40, imports: 1 }), // brought a sheet
    acc({
      orgId: "e",
      setupDone: true,
      recipes: 62,
      imports: 2,
      lastRateAt: "2026-09-06T09:00:00Z",
    }), // the product working
  ];

  it("counts each step as reached-at-least-this-far", () => {
    // An account that activated must still be counted at every earlier step,
    // or the funnel reports churn where there was success.
    const f = funnelOf(rows);
    expect(f.map((s) => s.count)).toEqual([5, 4, 3, 1]);
    expect(f.map((s) => s.key)).toEqual([
      "signed",
      "setup",
      "costed",
      "activated",
    ]);
  });

  it("keeps import out of the funnel, because it is not a step everybody passes", () => {
    // A kitchen can cost by hand, and the free tier cannot import at all. In
    // the funnel this drew "brought a sheet in: 0" above "changed a rate: 1"
    // — a later step larger than the one before it.
    const byHand = [
      acc({
        orgId: "hand",
        setupDone: true,
        recipes: 6,
        lastRateAt: "2026-09-06T00:00:00Z",
      }),
    ];
    const f = funnelOf(byHand);
    expect(f.some((s) => (s.key as string) === "imported")).toBe(false);
    expect(f.map((s) => s.count)).toEqual([1, 1, 1, 1]);
    expect(importReach(byHand)).toEqual({ count: 0, ofAll: 0 });
  });

  it("reports how many ever brought a sheet in, beside the funnel", () => {
    expect(importReach(rows)).toEqual({ count: 2, ofAll: 40 });
    expect(importReach([])).toEqual({ count: 0, ofAll: null });
  });

  it("says what share of everyone reached each step, and how many were lost", () => {
    const f = funnelOf(rows);
    expect(f[0]?.ofAll).toBe(100);
    expect(f[3]?.ofAll).toBe(20);
    expect(f.map((s) => s.lost)).toEqual([0, 1, 1, 2]);
  });

  it("does not divide by nobody", () => {
    const f = funnelOf([]);
    expect(f.every((s) => s.ofAll === null)).toBe(true);
    expect(f.every((s) => s.count === 0)).toBe(true);
  });

  it("names the accounts that set up and never brought a sheet", () => {
    expect(stuckBeforeImport(rows).map((r) => r.orgId)).toEqual(["b", "c"]);
  });

  it("names the accounts that costed a book and never moved a rate", () => {
    // Set up, dishes on file, and the product never used for what it is for.
    expect(costedButNeverMoved(rows).map((r) => r.orgId)).toEqual(["c", "d"]);
  });
});

describe("money taken", () => {
  const orders: readonly PaidOrder[] = [
    {
      orgId: "a",
      term: "monthly",
      amount: 75000,
      currency: "INR",
      paidAt: "2026-09-02T00:00:00Z",
    },
    {
      orgId: "a",
      term: "monthly",
      amount: 75000,
      currency: "INR",
      paidAt: "2026-08-02T00:00:00Z",
    },
    {
      orgId: "b",
      term: "year",
      amount: 750000,
      currency: "INR",
      paidAt: "2026-09-04T00:00:00Z",
    },
  ];

  it("counts in whole units, converting once at the end", () => {
    // Paise to rupees per order would round each one and report a total
    // nobody was ever charged.
    const r = revenueOf(orders, "2026-09-07");
    expect(r.all.total).toBe(9000);
    expect(r.all.count).toBe(3);
  });

  it("splits this month from last", () => {
    const r = revenueOf(orders, "2026-09-07");
    expect(r.thisMonth.total).toBe(8250);
    expect(r.lastMonth.total).toBe(750);
  });

  it("counts payers, not payments", () => {
    // Two orders from one account is one payer.
    expect(revenueOf(orders, "2026-09-07").payers).toBe(2);
  });

  it("breaks it down by term", () => {
    const r = revenueOf(orders, "2026-09-07");
    expect(r.byTerm.find((t) => t.term === "monthly")?.money.count).toBe(2);
    expect(r.byTerm.find((t) => t.term === "year")?.money.total).toBe(7500);
    expect(r.byTerm.find((t) => t.term === "quarter")?.money.total).toBe(0);
  });
});

describe("what is about to renew", () => {
  const rows = [
    acc({ orgId: "soon", plan: "paid", periodEnd: "2026-09-20T00:00:00Z" }),
    acc({ orgId: "later", plan: "paid", periodEnd: "2026-11-01T00:00:00Z" }),
    acc({
      orgId: "free-with-a-date",
      plan: "free",
      periodEnd: "2026-09-10T00:00:00Z",
    }),
    acc({ orgId: "gone", plan: "paid", periodEnd: "2026-08-01T00:00:00Z" }),
  ];

  it("takes paid accounts ending inside the window, soonest first", () => {
    expect(renewingWithin(rows, "2026-09-07", 30).map((r) => r.orgId)).toEqual([
      "soon",
    ]);
  });

  it("leaves out a free account carrying an old date", () => {
    // A lapsed subscription keeps its period end; it is not a renewal.
    expect(
      renewingWithin(rows, "2026-09-07", 400).map((r) => r.orgId),
    ).not.toContain("free-with-a-date");
  });
});

describe("signups by month", () => {
  it("gives every month in the window, including the empty ones", () => {
    // A chart that skips a month with no signups draws a flat line through
    // the month nobody joined.
    const out = signupsByMonth(
      [
        acc({ orgId: "a", createdAt: "2026-07-04T00:00:00Z" }),
        acc({ orgId: "b", createdAt: "2026-09-01T00:00:00Z" }),
      ],
      3,
      "2026-09-07",
    );
    expect(out.map((m) => m.period)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(out.map((m) => m.count)).toEqual([1, 0, 1]);
  });

  it("ignores an account older than the window rather than piling it on the first month", () => {
    const out = signupsByMonth(
      [acc({ orgId: "old", createdAt: "2025-01-01T00:00:00Z" })],
      3,
      "2026-09-07",
    );
    expect(out.every((m) => m.count === 0)).toBe(true);
  });
});

describe("what the books hold", () => {
  const rows = [
    acc({ orgId: "big", name: "Big Kitchen", setupDone: true, recipes: 62, ingredients: 210 }),
    acc({ orgId: "small", name: "Small", setupDone: true, recipes: 4, ingredients: 20 }),
    acc({ orgId: "empty", name: "Empty", setupDone: true }),
  ];

  it("adds up the dishes and ingredients across every book", () => {
    const h = whatIsHeld(rows);
    expect(h.dishes).toBe(66);
    expect(h.ingredients).toBe(230);
  });

  it("names the largest book, so 'is anybody using this properly' has an answer", () => {
    expect(whatIsHeld(rows).biggest).toEqual({ name: "Big Kitchen", dishes: 62 });
  });

  it("counts the accounts that finished setup and wrote nothing down", () => {
    expect(whatIsHeld(rows).empty).toBe(1);
  });

  it("has no largest book when nobody has costed anything", () => {
    // Null, not a name with nought beside it: "Empty, 0 dishes" reads as a
    // fact about that account rather than as an absence of any.
    expect(whatIsHeld([acc({ orgId: "a" })]).biggest).toBeNull();
  });
});

describe("when each book last moved", () => {
  const rows = [
    acc({ orgId: "hot", lastRateAt: "2026-09-07T08:00:00Z" }),
    acc({ orgId: "week", lastRateAt: "2026-09-04T08:00:00Z" }),
    acc({ orgId: "month", lastRateAt: "2026-08-25T08:00:00Z" }),
    acc({ orgId: "stale", lastRateAt: "2026-05-01T08:00:00Z" }),
    acc({ orgId: "never" }),
  ];

  it("buckets every book, and every book lands in exactly one", () => {
    const m = movedWhen(rows, "2026-09-07");
    expect(m.map((b) => [b.key, b.count])).toEqual([
      ["today", 1],
      ["week", 1],
      ["month", 1],
      ["older", 1],
      ["never", 1],
    ]);
    expect(m.reduce((n, b) => n + b.count, 0)).toBe(rows.length);
  });

  it("counts a book that never moved a rate as never, not as long ago", () => {
    // The two are different questions: one was used and stopped, the other
    // was never used for the thing the product is for.
    const m = movedWhen([acc({ orgId: "a" })], "2026-09-07");
    expect(m.find((b) => b.key === "never")?.count).toBe(1);
    expect(m.find((b) => b.key === "older")?.count).toBe(0);
  });
});

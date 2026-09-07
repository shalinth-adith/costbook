import { describe, expect, it } from "vitest";

import {
  type AccountRow,
  type PaidOrder,
  costedButNeverMoved,
  funnelOf,
  importReach,
  type Use,
  dailyUse,
  renewingWithin,
  revenueOf,
  signupsByMonth,
  stuckBeforeImport,
  useOver,
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

const use = (p: Partial<Use> & { day: string }): Use => ({
  orgId: "k1",
  userId: "u1",
  logins: 0,
  visits: 0,
  ...p,
});

describe("coming back, day by day", () => {
  const rows = [
    use({ day: "2026-09-05", orgId: "k1", userId: "u1", logins: 1, visits: 4 }),
    use({ day: "2026-09-05", orgId: "k2", userId: "u2", logins: 2, visits: 1 }),
    use({ day: "2026-09-07", orgId: "k1", userId: "u3", logins: 1, visits: 6 }),
  ];

  it("draws the days nobody came, rather than closing the gap", () => {
    // The whole point of a calendar series. Built from the rows alone, a week
    // with two dead days would read as an unbroken line of activity.
    const out = dailyUse(rows, 4, "2026-09-07");
    expect(out.map((d) => d.day)).toEqual([
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
    ]);
    expect(out[0]).toMatchObject({ logins: 0, visits: 0, kitchens: 0 });
    expect(out[2]).toMatchObject({ logins: 0, visits: 0, kitchens: 0 });
  });

  it("adds up a day and counts its kitchens and its people apart", () => {
    const out = dailyUse(rows, 4, "2026-09-07");
    expect(out[1]).toMatchObject({ logins: 3, visits: 5, kitchens: 2, people: 2 });
  });

  it("counts two people from one kitchen as one kitchen and two people", () => {
    const two = [
      use({ day: "2026-09-07", orgId: "k1", userId: "a", visits: 2 }),
      use({ day: "2026-09-07", orgId: "k1", userId: "b", visits: 3 }),
    ];
    const [day] = dailyUse(two, 1, "2026-09-07");
    expect(day).toMatchObject({ kitchens: 1, people: 2, visits: 5 });
  });

  it("ends on today, so the last row is the one being lived in", () => {
    const out = dailyUse([], 14, "2026-09-07");
    expect(out.at(-1)?.day).toBe("2026-09-07");
    expect(out).toHaveLength(14);
  });
});

describe("a fortnight of use", () => {
  const rows = [
    use({ day: "2026-09-05", orgId: "k1", userId: "u1", logins: 1, visits: 4 }),
    use({ day: "2026-09-07", orgId: "k1", userId: "u1", logins: 1, visits: 6 }),
    use({ day: "2026-09-06", orgId: "k2", userId: "u2", logins: 3, visits: 2 }),
  ];
  const days = dailyUse(rows, 7, "2026-09-07");

  it("separates a kitchen that came back from one that appeared once", () => {
    // The number that tells a product people use from one people tried, and
    // no total can answer it: k2 signed in three times, on one day.
    const span = useOver(days, rows);
    expect(span.kitchens).toBe(2);
    expect(span.cameBack).toBe(1);
  });

  it("totals the window and counts the days nobody was there", () => {
    const span = useOver(days, rows);
    expect(span.logins).toBe(5);
    expect(span.visits).toBe(12);
    expect(span.quietDays).toBe(4);
  });

  it("ignores rows outside the window it was given", () => {
    // `useRows` fetches thirty days and the console draws fourteen. A row
    // from three weeks ago must not be counted as a kitchen that came back.
    const old = [...rows, use({ day: "2026-08-01", orgId: "k3", visits: 9 })];
    const span = useOver(days, old);
    expect(span.kitchens).toBe(2);
    expect(span.visits).toBe(12);
  });
});

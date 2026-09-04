import { describe, expect, it } from "vitest";

import { PAID_MONTHLY } from "./org";
import {
  FREE_SUBSCRIPTION,
  TERMS,
  daysLeft,
  endOf,
  lapsed,
  perMonth,
  saving,
  termOf,
  tierOf,
} from "./plan";

describe("terms", () => {
  it("offers one, three, six and twelve months", () => {
    expect(TERMS.map((t) => t.months)).toEqual([1, 3, 6, 12]);
  });

  it("charges the monthly figure for a month, and less a month for longer", () => {
    expect(termOf("monthly")?.amount).toBe(PAID_MONTHLY.amount);
    const months = TERMS.map(perMonth);
    for (let i = 1; i < months.length; i++)
      expect(months[i]).toBeLessThan(months[i - 1] ?? 0);
  });

  it("saves nothing on a month and something on every longer term", () => {
    expect(saving(TERMS[0]!)).toBe(0);
    for (const t of TERMS.slice(1)) expect(saving(t)).toBeGreaterThan(0);
  });

  it("knows no other term", () => {
    expect(termOf("fortnight")).toBeUndefined();
    expect(termOf(null)).toBeUndefined();
  });
});

describe("endOf", () => {
  it("lands on the same day of the month", () => {
    expect(endOf(new Date(2026, 8, 5, 10), 1)).toEqual(
      new Date(2026, 9, 5, 10),
    );
    expect(endOf(new Date(2026, 8, 5, 10), 12)).toEqual(
      new Date(2027, 8, 5, 10),
    );
  });

  it("clamps a 31st to the last day of a shorter month", () => {
    expect(endOf(new Date(2026, 0, 31), 1)).toEqual(new Date(2026, 1, 28));
    expect(endOf(new Date(2026, 9, 31), 1)).toEqual(new Date(2026, 10, 30));
  });
});

describe("tierOf", () => {
  const now = new Date("2026-09-05T12:00:00Z");

  it("is free on a free row", () => {
    expect(tierOf(FREE_SUBSCRIPTION, now)).toBe("free");
  });

  it("is paid while the stretch runs and free once it has ended", () => {
    const paid = {
      ...FREE_SUBSCRIPTION,
      plan: "paid" as const,
      term: "monthly" as const,
    };
    expect(tierOf({ ...paid, periodEnd: "2026-10-05T12:00:00Z" }, now)).toBe(
      "paid",
    );
    expect(tierOf({ ...paid, periodEnd: "2026-09-01T12:00:00Z" }, now)).toBe(
      "free",
    );
    expect(lapsed({ ...paid, periodEnd: "2026-09-01T12:00:00Z" }, now)).toBe(
      true,
    );
    expect(lapsed({ ...paid, periodEnd: "2026-10-05T12:00:00Z" }, now)).toBe(
      false,
    );
  });

  it("keeps a paid row with no end date paid", () => {
    expect(tierOf({ ...FREE_SUBSCRIPTION, plan: "paid" }, now)).toBe("paid");
  });

  it("counts the days left in whole days", () => {
    expect(
      daysLeft(
        { ...FREE_SUBSCRIPTION, periodEnd: "2026-09-12T12:00:00Z" },
        now,
      ),
    ).toBe(7);
    expect(
      daysLeft(
        { ...FREE_SUBSCRIPTION, periodEnd: "2026-09-05T18:00:00Z" },
        now,
      ),
    ).toBe(1);
    expect(daysLeft(FREE_SUBSCRIPTION, now)).toBeNull();
  });
});

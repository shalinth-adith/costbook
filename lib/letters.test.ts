import { describe, expect, it } from "vitest";

import {
  ENDING_DAYS,
  boughtLetter,
  dateSaid,
  dueFor,
  endedLetter,
  endingLetter,
  moneySaid,
  stuckAlert,
  stuckLetter,
} from "./letters";

/**
 * Mail about money, to somebody who is not looking at the product.
 *
 * Two things are worth pinning. The promises: a lapse loses nothing, no card
 * is kept, nothing renews — say any of those wrongly and a café either panics
 * or feels tricked. And the timing: a reminder that never fires is silence,
 * and one that fires twice is a product that nags about money.
 */

const sub = (over: Partial<Parameters<typeof dueFor>[0]> = {}) => ({
  plan: "paid" as const,
  periodEnd: "2026-10-14T00:00:00.000Z",
  endingNoticeAt: null,
  endedNoticeAt: null,
  ...over,
});

describe("what the letters promise", () => {
  const bought = boughtLetter({
    term: "quarter",
    amountMinor: 149_700,
    currency: "INR",
    until: "2026-12-14T00:00:00.000Z",
    orgName: "Dev Kitchen",
  });

  it("puts the date the book runs to in the subject, which is what they come back for", () => {
    expect(bought.subject).toContain("14 December 2026");
  });

  it("says no card is kept and nothing renews", () => {
    expect(bought.body).toMatch(/nothing renews by itself/i);
    expect(bought.body).toMatch(/no card is kept/i);
  });

  it("says what lapsing does not take away, in every letter that mentions lapsing", () => {
    const ending = endingLetter({
      until: "2026-10-14T00:00:00.000Z",
      days: 7,
      orgName: "Dev Kitchen",
    });
    const ended = endedLetter({
      until: "2026-10-14T00:00:00.000Z",
      orgName: "Dev Kitchen",
    });
    expect(ending.body).toMatch(/nothing is deleted/i);
    expect(ended.body).toMatch(/nothing has been deleted/i);
    // The pass was bought once and is not a rental.
    expect(ended.body).toMatch(/export pass, it is still yours/i);
  });

  it("never threatens the work", () => {
    for (const letter of [
      bought,
      endingLetter({ until: "2026-10-14T00:00:00.000Z", days: 3, orgName: "K" }),
      endedLetter({ until: "2026-10-14T00:00:00.000Z", orgName: "K" }),
    ]) {
      expect(letter.body).not.toMatch(/will be (deleted|removed|lost)/i);
      expect(letter.body).not.toMatch(/lose your (data|recipes|dishes)/i);
    }
  });

  it("says tomorrow rather than 'in 1 days'", () => {
    const one = endingLetter({ until: "2026-10-14T00:00:00.000Z", days: 1, orgName: "K" });
    expect(one.subject).toContain("tomorrow");
    expect(one.body).not.toMatch(/in 1 days/);
  });
});

describe("the payment that was taken and did not land", () => {
  it("tells the café it is known about and not to pay again", () => {
    const letter = stuckLetter({ amountMinor: 49_900, currency: "INR", orgName: "K" });
    expect(letter.body).toMatch(/not pay again/i);
    expect(letter.body).toMatch(/a person is on it/i);
  });

  it("gives support the ids and not the reassurance", () => {
    const alert = stuckAlert({
      orderId: "order_x",
      paymentId: "pay_y",
      amountMinor: 49_900,
      currency: "INR",
      orgId: "org_z",
      said: "no subscription row",
    });
    expect(alert.subject).toContain("order_x");
    for (const id of ["order_x", "pay_y", "org_z", "no subscription row"]) {
      expect(alert.body).toContain(id);
    }
  });
});

describe("money and dates, said the way a person says them", () => {
  it("prints rupees with the symbol, not the minor unit", () => {
    expect(moneySaid(149_700, "INR")).toBe("₹1,497");
  });

  it("names a currency it has no symbol for rather than guessing one", () => {
    expect(moneySaid(1_000, "AED")).toBe("AED 10");
  });

  it("writes a date the way it is read aloud", () => {
    expect(dateSaid("2026-10-14T00:00:00.000Z")).toBe("14 October 2026");
  });
});

describe("which reminder is due", () => {
  const day = (n: number) => new Date(`2026-10-${String(n).padStart(2, "0")}T09:00:00.000Z`);

  it("says nothing while the stretch has a way to run", () => {
    expect(dueFor(sub(), day(1))).toBeNull();
  });

  it("reminds a week out", () => {
    expect(dueFor(sub(), day(7))).toBe("ending");
    expect(ENDING_DAYS).toBe(7);
  });

  it("still reminds inside the week, so one missed morning is not silence", () => {
    /*
     * A job that fires only at exactly seven days sends nothing at all if it
     * fails to run that day — and the letter it misses is the one the café
     * needed. Any day inside the window sends; the stamp stops the second.
     */
    for (const d of [8, 9, 10, 13]) expect(dueFor(sub(), day(d))).toBe("ending");
  });

  it("does not remind twice", () => {
    const already = sub({ endingNoticeAt: "2026-10-07T09:00:00.000Z" });
    expect(dueFor(already, day(9))).toBeNull();
  });

  it("says it has ended, once, after the date", () => {
    const over = sub({ endingNoticeAt: "2026-10-07T09:00:00.000Z" });
    expect(dueFor(over, day(15))).toBe("ended");
    expect(dueFor({ ...over, endedNoticeAt: "2026-10-15T09:00:00.000Z" }, day(16))).toBeNull();
  });

  it("has nothing to say about an account that never bought anything", () => {
    expect(dueFor(sub({ periodEnd: null }), day(9))).toBeNull();
  });
});

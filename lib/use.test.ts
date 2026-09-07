import { beforeEach, describe, expect, it } from "vitest";

import { VISIT_WINDOW_MS, forgetVisits, opensNewVisit } from "./use";

/**
 * The window is the whole design of this measure: a visit is a stretch of
 * work, not a page view, so what it counts has to be asserted rather than
 * assumed. Get it wrong in one direction and the console reports the router's
 * chattiness; wrong in the other and a day at the book reads as one touch.
 */
describe("what counts as one visit", () => {
  beforeEach(forgetVisits);

  it("counts the first touch", () => {
    expect(opensNewVisit("u1", 1_000_000)).toBe(true);
  });

  it("does not count the eight screens that follow it", () => {
    const at = 1_000_000;
    expect(opensNewVisit("u1", at)).toBe(true);
    for (let i = 1; i <= 8; i += 1) {
      expect(opensNewVisit("u1", at + i * 30_000)).toBe(false);
    }
  });

  it("counts again once the window has passed", () => {
    const at = 1_000_000;
    opensNewVisit("u1", at);
    expect(opensNewVisit("u1", at + VISIT_WINDOW_MS - 1)).toBe(false);
    expect(opensNewVisit("u1", at + VISIT_WINDOW_MS)).toBe(true);
  });

  it("keeps one person's window out of another's", () => {
    // Two people in the same kitchen are two stretches of work, and a shared
    // window would have counted the second one as the first one's tail.
    const at = 1_000_000;
    expect(opensNewVisit("u1", at)).toBe(true);
    expect(opensNewVisit("u2", at + 1000)).toBe(true);
    expect(opensNewVisit("u1", at + 2000)).toBe(false);
  });

  it("forgets people who have gone, rather than growing without end", () => {
    const at = 1_000_000;
    for (let i = 0; i < 600; i += 1) opensNewVisit(`u${String(i)}`, at);
    // Long after the window: the next arrival sweeps the stale entries, and
    // everyone who left is counted afresh when they come back.
    const later = at + VISIT_WINDOW_MS * 2;
    expect(opensNewVisit("someone-new", later)).toBe(true);
    expect(opensNewVisit("u0", later + 1)).toBe(true);
  });
});

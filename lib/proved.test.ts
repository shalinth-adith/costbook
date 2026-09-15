import { describe, expect, it } from "vitest";

import { PROOF_WINDOW_MS, provedByCode } from "./proved";

const NOW = Date.UTC(2026, 8, 16, 0, 0, 0);
const secondsAgo = (s: number) => Math.floor((NOW - s * 1000) / 1000);

describe("provedByCode", () => {
  it("accepts a session earned by a code a moment ago", () => {
    expect(
      provedByCode([{ method: "otp", timestamp: secondsAgo(30) }], NOW),
    ).toBe(true);
  });

  it("refuses a password sign-in, which proved nothing about the address", () => {
    expect(
      provedByCode([{ method: "password", timestamp: secondsAgo(30) }], NOW),
    ).toBe(false);
  });

  it("refuses a code older than the hour it lasts", () => {
    const old = secondsAgo(PROOF_WINDOW_MS / 1000 + 60);
    expect(provedByCode([{ method: "otp", timestamp: old }], NOW)).toBe(false);
  });

  it("takes the newest code when there are several", () => {
    const old = secondsAgo(PROOF_WINDOW_MS / 1000 + 60);
    expect(
      provedByCode(
        [
          { method: "otp", timestamp: old },
          { method: "otp", timestamp: secondsAgo(5) },
        ],
        NOW,
      ),
    ).toBe(true);
  });

  it("refuses the bare form, which carries no time to judge", () => {
    expect(provedByCode(["otp"], NOW)).toBe(false);
  });

  it("refuses an empty claim", () => {
    expect(provedByCode([], NOW)).toBe(false);
  });
});

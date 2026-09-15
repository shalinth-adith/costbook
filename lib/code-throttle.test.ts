import { describe, expect, it } from "vitest";

import {
  EVERYONE,
  PER_ADDRESS,
  codeSendAllowed,
  masked,
  windowStart,
} from "./code-throttle";

describe("codeSendAllowed", () => {
  it("lets the first code through", () => {
    expect(codeSendAllowed({ toThisAddress: 0, toAnyone: 0 })).toEqual({
      ok: true,
    });
  });

  it("allows up to the per-address limit and refuses the next one", () => {
    expect(
      codeSendAllowed({ toThisAddress: PER_ADDRESS.limit - 1, toAnyone: 5 }).ok,
    ).toBe(true);
    expect(
      codeSendAllowed({ toThisAddress: PER_ADDRESS.limit, toAnyone: 5 }),
    ).toEqual({
      ok: false,
      reason: "address",
    });
  });

  it("refuses everybody once the global ceiling is reached", () => {
    expect(
      codeSendAllowed({ toThisAddress: 0, toAnyone: EVERYONE.limit }),
    ).toEqual({
      ok: false,
      reason: "everyone",
    });
  });

  it("names the address limit first when both are hit, because that is the one a person can act on", () => {
    expect(
      codeSendAllowed({
        toThisAddress: PER_ADDRESS.limit,
        toAnyone: EVERYONE.limit,
      }),
    ).toEqual({ ok: false, reason: "address" });
  });
});

describe("windowStart", () => {
  it("is the window's length before now, as an ISO instant", () => {
    const now = Date.UTC(2026, 8, 15, 12, 0, 0);
    expect(windowStart(now, PER_ADDRESS)).toBe("2026-09-15T11:45:00.000Z");
    expect(windowStart(now, EVERYONE)).toBe("2026-09-15T11:50:00.000Z");
  });
});

describe("masked", () => {
  it("keeps enough to tell addresses apart and not enough to write to", () => {
    expect(masked("meena@srikrishnacafe.in")).toBe("me…@srikrishnacafe.in");
    expect(masked("nonsense")).toBe("<no address>");
  });
});

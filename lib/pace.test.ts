import { describe, expect, it } from "vitest";

import { atLeast } from "./pace";

describe("atLeast", () => {
  it("holds a fast reply to the floor", async () => {
    const started = Date.now();
    const out = await atLeast(120, () => Promise.resolve("done"));
    expect(out).toBe("done");
    expect(Date.now() - started).toBeGreaterThanOrEqual(115);
  });

  it("adds nothing to a reply already past the floor", async () => {
    const started = Date.now();
    await atLeast(20, () => new Promise((r) => setTimeout(() => r(null), 60)));
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(55);
    expect(took).toBeLessThan(200);
  });

  it("returns whatever the work returned", async () => {
    expect(
      await atLeast(1, () => Promise.resolve({ ok: false, exists: true })),
    ).toEqual({
      ok: false,
      exists: true,
    });
  });
});

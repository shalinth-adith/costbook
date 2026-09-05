import { beforeEach, describe, expect, it } from "vitest";

import { afterSignIn } from "./after-auth";
import { landingFor } from "./landing";
import * as memory from "./store";

/**
 * Where somebody lands after signing in.
 *
 * One answer, in one place, because it used to be three: sign-in sent
 * everyone to the dashboard, sign-up to setup, and the guard held a third
 * opinion. The order below is the whole of it, and the order is the part that
 * can go wrong quietly.
 */
beforeEach(() => {
  memory.setOrg({ setupDone: true });
});

describe("afterSignIn", () => {
  it("sends an unfinished account to setup, whatever it asked for", async () => {
    memory.setOrg({ setupDone: false });
    // Setup wins over the intended destination: every figure on the page they
    // wanted would be reading off settings nobody has given yet.
    expect(await afterSignIn("/recipes/dish-1")).toBe("/setup");
  });

  it("honours where they were going before they were asked to sign in", async () => {
    expect(await afterSignIn("/recipes/dish-1")).toBe("/recipes/dish-1");
  });

  it("falls back to their own landing page when they were going nowhere", async () => {
    expect(await afterSignIn(null)).toBe(landingFor("owner"));
  });

  it("refuses a destination pointing off this site", async () => {
    // The redirect carries our own domain, so an attacker who chooses where it
    // goes has a phishing page arriving with our name on it.
    for (const hostile of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
    ]) {
      const landed = await afterSignIn(hostile);
      expect(landed.startsWith("/")).toBe(true);
      expect(landed.startsWith("//")).toBe(false);
      expect(landed).not.toContain("evil");
    }
  });

  it("ignores a next value that is not text at all", async () => {
    expect(await afterSignIn(null)).toBe(landingFor("owner"));
  });
});

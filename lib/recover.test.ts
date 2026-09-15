import { describe, expect, it } from "vitest";

import {
  LINK_FAILED,
  CODE_MINUTES,
  RESET_SENT,
  confirmType,
  landingAfterConfirm,
  passwordFault,
} from "./recover";

/**
 * The two flows a person meets when they cannot get in. What is worth proving
 * is that the screen never reveals who has an account, that a link type off a
 * URL is checked rather than trusted, and that a recovery link lands on the
 * one screen it exists for.
 */

describe("the reset screen keeps its mouth shut", () => {
  it("says the same thing whether or not the address has an account", () => {
    expect(RESET_SENT).toMatch(/if that address has an account/i);
  });

  it("promises a code, because that is what is sent", () => {
    expect(RESET_SENT).toMatch(/six-digit code/i);
    expect(RESET_SENT).not.toMatch(/\blink\b/i);
  });

  it("never says an account was not found", () => {
    for (const giveaway of [/no account/i, /not found/i, /unknown address/i, /isn't registered/i]) {
      expect(RESET_SENT).not.toMatch(giveaway);
    }
  });

  it("says the old password still works, because that is the fear", () => {
    expect(RESET_SENT).toMatch(/current password still works/i);
  });

  it("tells them how long they have", () => {
    expect(CODE_MINUTES).toBe(60);
    expect(RESET_SENT).toMatch(/an hour/i);
  });
});

describe("what arrives on the URL is checked, not trusted", () => {
  it("accepts the types this product asks for", () => {
    for (const t of ["recovery", "signup", "email", "email_change", "invite"]) {
      expect(confirmType(t)).toBe(t);
    }
  });

  it("refuses anything else", () => {
    for (const junk of ["magiclink", "sms", "", "  ", "recovery; drop", null, undefined]) {
      expect(confirmType(junk)).toBeNull();
    }
  });

  it("tolerates the whitespace a mail client can add", () => {
    expect(confirmType(" recovery ")).toBe("recovery");
  });
});

describe("where a link lands", () => {
  it("sends a recovery link to the screen that chooses a password", () => {
    /*
     * Not the dashboard. Somebody following a recovery link cannot remember
     * their password; signing them in and saying nothing would leave the
     * account holding the password they were trying to replace.
     */
    expect(landingAfterConfirm("recovery")).toBe("/reset/new");
  });

  it("lets every other type defer to afterSignIn", () => {
    for (const t of ["signup", "email", "email_change", "invite"] as const) {
      expect(landingAfterConfirm(t)).toBeNull();
    }
  });
});

describe("a failed link", () => {
  it("gives one sentence and one thing to do", () => {
    expect(LINK_FAILED).toMatch(/expired or has already been used/i);
    expect(LINK_FAILED).toMatch(/ask for another/i);
  });
});

describe("the password rule, enforced where it is chosen", () => {
  it("refuses a short one", () => {
    expect(passwordFault("short")).toMatch(/8 characters/);
  });

  it("refuses an empty one with a different sentence", () => {
    expect(passwordFault("")).toBe("Choose a password.");
  });

  it("accepts eight characters of anything", () => {
    expect(passwordFault("aardvark")).toBeNull();
  });
});

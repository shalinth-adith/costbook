import { describe, expect, it } from "vitest";

import { codeLetter } from "./codes";

/**
 * A message somebody reads on a phone while looking at a form on a laptop.
 * What matters is that the code is findable without opening it, that it says
 * which flow it belongs to, and that it never asks for anything back.
 */

describe("the code mail", () => {
  const signup = codeLetter({ code: "123456", purpose: "signup" });
  const recovery = codeLetter({ code: "654321", purpose: "recovery" });

  it("puts the code in the subject, where a lock screen shows it", () => {
    expect(signup.subject).toContain("123456");
    expect(recovery.subject).toContain("654321");
  });

  it("opens with the code, before any prose", () => {
    expect(signup.body.startsWith("123456")).toBe(true);
  });

  it("says which flow it is for", () => {
    expect(signup.body).toMatch(/finish signing up/i);
    expect(recovery.body).toMatch(/choose a new password/i);
  });

  it("carries no link at all, which is the entire point", () => {
    for (const letter of [signup, recovery]) {
      expect(letter.body).not.toMatch(/https?:\/\//);
      expect(letter.body).not.toMatch(/\bclick\b/i);
    }
  });

  it("tells them nobody will ask for it, and that ignoring it is safe", () => {
    expect(signup.body).toMatch(/nobody at costbook will ever ask you for it/i);
    expect(signup.body).toMatch(/did not ask for this/i);
  });
});

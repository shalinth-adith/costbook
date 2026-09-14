import { describe, expect, it } from "vitest";

import { CODE_LENGTH, CODE_REFUSED, codeFault, digitsOf } from "./verify";

/**
 * The code someone types out of an email. What matters is that ordinary,
 * slightly messy human input is accepted rather than corrected, and that a
 * refusal says the one thing worth saying.
 */

describe("taking the digits out of what was pasted", () => {
  it("accepts the plain thing", () => {
    expect(digitsOf("123456")).toBe("123456");
  });

  it("accepts the way mail clients break it up", () => {
    for (const pasted of ["123 456", "123-456", " 123456 ", "123 456"]) {
      expect(digitsOf(pasted)).toBe("123456");
    }
  });

  it("takes the code out of a whole pasted line", () => {
    expect(digitsOf("Your code is 123456 — it lasts an hour")).toBe("123456");
  });

  it("stops at six, so a stray digit after it cannot corrupt the code", () => {
    expect(digitsOf("1234567890")).toBe("123456");
    expect(CODE_LENGTH).toBe(6);
  });
});

describe("what is said about a code that is not ready", () => {
  it("asks for it when the box is empty", () => {
    expect(codeFault("")).toMatch(/from the email/i);
    expect(codeFault("   ")).toMatch(/from the email/i);
  });

  it("counts what is there rather than saying 'invalid'", () => {
    expect(codeFault("123")).toBe("6 digits — that one is 3.");
  });

  it("passes six digits however they arrived", () => {
    expect(codeFault("123 456")).toBeNull();
  });
});

describe("a code the provider refused", () => {
  it("gives one sentence and one thing to do", () => {
    expect(CODE_REFUSED).toMatch(/expired or does not match/i);
    expect(CODE_REFUSED).toMatch(/ask for another/i);
  });
});

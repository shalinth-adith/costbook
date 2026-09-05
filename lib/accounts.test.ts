import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  attemptsFor,
  directory,
  lookup,
  markVerificationSent,
  recordAttempts,
  verify,
} from "./accounts";

/**
 * The development sign-in directory.
 *
 * Three known passwords in a file. That is fine while it can only ever answer
 * in development, and catastrophic the day it answers in production — so the
 * behaviour worth pinning is not who is in the list, it is that the list
 * refuses to speak at all when NODE_ENV says production.
 */
/*
 * NODE_ENV is typed read-only, so it is written through the record rather
 * than the property. The module reads it live at call time, which is the
 * behaviour being tested: a deploy that has not wired Supabase must fail at
 * the first sign-in rather than quietly admitting anybody.
 */
const env = process.env as unknown as Record<string, string | undefined>;
let was: string | undefined;

beforeEach(() => {
  was = env["NODE_ENV"];
});

afterEach(() => {
  if (was === undefined) delete env["NODE_ENV"];
  else env["NODE_ENV"] = was;
});

/** Runs `run` with the environment claiming production. */
function inProduction<T>(run: () => T): () => T {
  return () => {
    env["NODE_ENV"] = "production";
    return run();
  };
}

describe("the fixture directory", () => {
  it("refuses to answer in production, rather than admitting three known passwords", () => {
    expect(
      inProduction(() => verify("dev@costbook.test", "costbook-dev")),
    ).toThrow(/no auth backend/i);
    expect(inProduction(() => lookup("dev@costbook.test"))).toThrow(
      /no auth backend/i,
    );
    expect(inProduction(directory)).toThrow(/no auth backend/i);
  });

  it("says what to do about it, not merely that something is wrong", () => {
    try {
      inProduction(directory)();
    } catch (error) {
      expect(String(error)).toMatch(/supabase/i);
      return;
    }
    throw new Error("it should have thrown");
  });

  it("knows the development account the dev-login route uses", () => {
    expect(verify("dev@costbook.test", "costbook-dev")).toBe(true);
    expect(verify("dev@costbook.test", "wrong")).toBe(false);
  });

  it("ignores case and stray spaces around an address, as every sign-in box must", () => {
    expect(verify("  DEV@Costbook.test  ", "costbook-dev")).toBe(true);
  });

  it("keeps its own development account on a domain that can never be reached", () => {
    /*
     * The two demo accounts are a fictional café and are only ever readable
     * in development. The one that matters is Costbook's own: it is typed
     * into /api/auth/dev-login and would create a real account in a real
     * project, so it sits on a domain RFC 2606 reserves twice over.
     */
    expect(directory()).toContain("dev@costbook.test");
    expect(lookup("dev@costbook.test")?.email).toMatch(/\.test$/);
  });

  it("returns null for an address it does not know, rather than guessing", () => {
    expect(lookup("nobody@costbook.test")).toBeNull();
  });
});

describe("the attempt ledger", () => {
  it("starts at nothing for an address nobody has tried", () => {
    expect(attemptsFor("fresh@costbook.test")).toEqual({
      wrong: 0,
      lockedUntil: null,
    });
  });

  it("remembers what it was told, by address", () => {
    recordAttempts("one@costbook.test", { wrong: 3, lockedUntil: 123 });
    expect(attemptsFor("one@costbook.test")).toEqual({
      wrong: 3,
      lockedUntil: 123,
    });
    expect(attemptsFor("two@costbook.test").wrong).toBe(0);
  });
});

describe("the verification clock", () => {
  it('moves, so the card stops saying "four days ago" — and sends nothing', () => {
    const before = lookup("meena@srikrishnacafe.in")?.verificationSentAt ?? 0;
    markVerificationSent("meena@srikrishnacafe.in");
    const after = lookup("meena@srikrishnacafe.in")?.verificationSentAt ?? 0;
    expect(after).toBeGreaterThan(before);
  });
});

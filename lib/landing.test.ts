import { describe, expect, it } from "vitest";

import { gateFor, isPublic } from "./landing";

/**
 * Which pages a stranger may read.
 *
 * Nothing covered this, and the cost showed the first time a page was added:
 * /about went in behind the wordmark on every screen, was reachable from the
 * footer of the sign-in page, and redirected anyone who pressed it back to
 * sign-in. A closed loop, invisible to the build and to the type checker.
 */
describe("what a signed-out visitor may read", () => {
  it("lets them read the pages that exist to be read before signing up", () => {
    for (const path of [
      "/",
      "/sign-in",
      "/sign-up",
      "/about",
      "/contact",
      "/privacy",
      "/terms",
    ]) {
      expect(isPublic(path), path).toBe(true);
    }
  });

  it("lets a crawler read the files that say what it may crawl", () => {
    // Both were gated once, so the landing page could not be indexed because
    // the file granting permission to index it was behind a login.
    expect(isPublic("/robots.txt")).toBe(true);
    expect(isPublic("/sitemap.xml")).toBe(true);
  });

  it("lets a link preview fetch the card", () => {
    // The image route answered 307 to sign-in, so a shared link unfurled
    // into nothing. Same closed loop as /about, one route later.
    expect(isPublic("/opengraph-image")).toBe(true);
  });

  it("does not let them read anything belonging to a book", () => {
    for (const path of [
      "/dashboard",
      "/recipes",
      "/ingredients",
      "/import",
      "/settings",
    ]) {
      expect(isPublic(path), path).toBe(false);
    }
  });

  it("does not treat a path that merely starts the same as public", () => {
    // "/terms" must not open "/terms-of-nothing", and the root must not open
    // everything by prefix.
    expect(isPublic("/termsandconditions")).toBe(false);
    expect(isPublic("/aboutus")).toBe(false);
  });
});

describe("the gate", () => {
  // Role is meaningless while signed out — the proxy passes "manager" there
  // because the type has no third state, and so does this.
  const out = { signedIn: false, setupDone: false, role: "manager" } as const;
  const inSetup = { signedIn: true, setupDone: false, role: "owner" } as const;
  const done = { signedIn: true, setupDone: true, role: "owner" } as const;

  it("sends a signed-out visitor to sign in, and leaves public pages alone", () => {
    expect(gateFor(out, "/dashboard")).not.toBeNull();
    expect(gateFor(out, "/about")).toBeNull();
    expect(gateFor(out, "/sign-in")).toBeNull();
  });

  it("holds an account that has not answered the four questions at setup", () => {
    expect(gateFor(inSetup, "/dashboard")).toBe("/setup");
    expect(gateFor(inSetup, "/setup")).toBeNull();
  });

  it("turns a finished account away from setup rather than asking again", () => {
    expect(gateFor(done, "/setup")).not.toBe("/setup");
    expect(gateFor(done, "/dashboard")).toBeNull();
  });

  it("lets a finished account read About without being sent home", () => {
    // The mark is in the top bar of every signed-in screen; a redirect here
    // would make it look broken.
    expect(gateFor(done, "/about")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { PUBLIC_PATHS, gateFor, isPublic } from "./landing";

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

describe("the sitemap and the gate say the same thing", () => {
  /*
   * Two hand-kept lists of the public pages, and they had already drifted:
   * /about was reachable without a session and absent from the sitemap, so
   * the one page written to be read BEFORE signing up was the one a crawler
   * was never told about.
   *
   * Files are not screens. robots.txt, the sitemap itself and the social card
   * are public because a crawler fetches them, and listing them inside the
   * sitemap would be a sitemap that points at itself.
   */
  const FILES = ["/robots.txt", "/sitemap.xml", "/opengraph-image"];

  it("lists every public screen, and only those", async () => {
    const { default: sitemap } = await import("@/app/sitemap");
    const listed = sitemap().map((e) => new URL(e.url).pathname);

    for (const path of PUBLIC_PATHS) {
      if (FILES.includes(path)) continue;
      expect(listed, `${path} is reachable signed out but not in the sitemap`)
        .toContain(path);
    }
    for (const path of listed) {
      expect(isPublic(path), `${path} is in the sitemap but needs a session`)
        .toBe(true);
    }
  });

  it("never tells a crawler it may read a page behind the gate", async () => {
    /*
     * robots.txt was a third copy of this list and had drifted the same way.
     * It derives from PUBLIC_PATHS now, so what this guards is the direction
     * that would actually hurt: a screen needing a session appearing under
     * allow, which invites a crawler to index a redirect to sign-in.
     */
    const { default: robots } = await import("@/app/robots");
    const rules = robots().rules as {
      allow?: string[];
      disallow?: string[];
    };
    for (const path of rules.allow ?? []) {
      expect(isPublic(path), `robots.txt allows ${path}, which needs a session`)
        .toBe(true);
    }
    for (const path of rules.disallow ?? []) {
      expect(isPublic(path), `robots.txt disallows ${path}, which is public`)
        .toBe(false);
    }
  });
});

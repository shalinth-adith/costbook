import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAIL_SENDER, SUPPORT_EMAIL } from "./org";

/**
 * One address, in one place.
 *
 * It was written out thirteen times across twelve files, and the mailbox that
 * was finally created had a different name — so every address a customer
 * could see pointed at nothing. Nobody would have reported that: mail to a
 * dead address does not bounce back to the sender of the page, it bounces to
 * the person who wrote in, who concludes there is nobody there.
 *
 * A constant fixes today. This stops tomorrow: the next person to need the
 * support address in a new screen will type it out, because that is what
 * everybody does, and this fails when they do.
 */

const ROOTS = ["app", "components", "lib", "core"];
const CODE = /\.(ts|tsx)$/;

/*
 * Only the real domain. `.test` is reserved twice over — RFC 2606 reserves
 * both `example.*` and the `.test` TLD — so it can never be registered and
 * never mail a stranger, which is exactly why the fixtures and the
 * development account live there. Guarding it would be guarding the one
 * place a made-up address is correct.
 */
const REAL = /[A-Za-z0-9._%+-]+@costbook\.in/g;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (CODE.test(name)) out.push(path);
  }
  return out;
}

describe("the support address", () => {
  it("is spelled out nowhere but lib/org.ts", () => {
    const written: string[] = [];
    for (const path of new Set(ROOTS.flatMap(sources))) {
      // The constant's own home, and this test, are the two exceptions.
      if (path.endsWith("lib/org.ts") || path.endsWith("support-email.test.ts")) {
        continue;
      }
      const hits = [...readFileSync(path, "utf8").matchAll(REAL)].map((m) => m[0]);
      if (hits.length > 0) written.push(`${path}: ${[...new Set(hits)].join(", ")}`);
    }
    expect(written, "import SUPPORT_EMAIL from @/lib/org instead").toEqual([]);
  });

  it("is what mail goes out as, so a reply comes back to the same place", () => {
    // A message that arrives from one address and asks to be answered at
    // another is how a support thread gets lost.
    expect(MAIL_SENDER).toContain(SUPPORT_EMAIL);
  });
});

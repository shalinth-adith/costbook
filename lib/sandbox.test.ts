import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const host = { value: "localhost:3000" };

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: (name: string) => (name === "host" ? host.value : null),
    }),
}));

const { sandboxAllowed } = await import("./sandbox");

/**
 * The switch that turns a paid plan on without a payment.
 *
 * It exists so the billing screens can be used without a payment provider,
 * and it is one careless deploy away from giving the product away. Two things
 * have to be true for it to answer yes, and the test that matters is every
 * way of it saying no.
 */
let was: string | undefined;

beforeEach(() => {
  was = process.env["COSTBOOK_BILLING_SANDBOX"];
  process.env["COSTBOOK_BILLING_SANDBOX"] = "true";
  host.value = "localhost:3000";
});

afterEach(() => {
  if (was === undefined) delete process.env["COSTBOOK_BILLING_SANDBOX"];
  else process.env["COSTBOOK_BILLING_SANDBOX"] = was;
});

describe("the billing sandbox", () => {
  it("answers on the machine it exists for", async () => {
    expect(await sandboxAllowed()).toBe(true);
    for (const local of [
      "localhost",
      "127.0.0.1",
      "127.0.0.1:3000",
      "[::1]",
      "[::1]:3000",
    ]) {
      host.value = local;
      expect(await sandboxAllowed()).toBe(true);
    }
  });

  it("refuses a real domain even with the flag set", async () => {
    /*
     * The whole point. NODE_ENV is no use here — `npm start` is a production
     * build, which is how the local server runs — so a NODE_ENV gate would
     * switch this off on the one machine it is for, while a flag-only gate
     * would leave a variable left set on a deploy giving plans away.
     */
    for (const deployed of [
      "costbook.in",
      "app.costbook.in",
      "costbook.vercel.app",
      "localhost.evil.example",
    ]) {
      host.value = deployed;
      expect(await sandboxAllowed()).toBe(false);
    }
  });

  it("refuses when the flag is not set, whatever the host", async () => {
    delete process.env["COSTBOOK_BILLING_SANDBOX"];
    expect(await sandboxAllowed()).toBe(false);
  });

  it("refuses a flag that is merely present rather than true", async () => {
    for (const nearly of ["1", "yes", "TRUE", ""]) {
      process.env["COSTBOOK_BILLING_SANDBOX"] = nearly;
      expect(await sandboxAllowed()).toBe(false);
    }
  });

  it("refuses a request that arrives with no host at all", async () => {
    host.value = "";
    expect(await sandboxAllowed()).toBe(false);
  });
});

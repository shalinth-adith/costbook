import { headers } from "next/headers";

/**
 * Whether a plan may be switched on here without a payment.
 *
 * Two things have to be true, and the second is the one that matters. The
 * flag is deliberate: somebody set `COSTBOOK_BILLING_SANDBOX=true` to try the
 * billing screens without a provider. The host is the guard: this only ever
 * answers yes to a request that arrived at localhost.
 *
 * NODE_ENV is no use for this. `npm start` is a production build, which is
 * how the local server runs, so gating on it would switch the sandbox off on
 * the one machine it exists for — and gating on the flag alone means a
 * variable left set on a real deployment is a free plan for anybody who owns
 * a book. A deployed server answers on its own domain; this one does not.
 */
export async function sandboxAllowed(): Promise<boolean> {
  if (process.env["COSTBOOK_BILLING_SANDBOX"] !== "true") return false;
  const host = (await headers()).get("host") ?? "";
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

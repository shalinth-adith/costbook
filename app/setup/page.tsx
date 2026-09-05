import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup-wizard";
import { CurrencyProvider } from "@/components/currency-provider";

import { book } from "@/lib/book";
import { landingFor } from "@/lib/landing";

/**
 * Setup, asked once after sign-up and before there is any data.
 *
 * Not reachable afterwards. Every answer is also in Settings, where changing
 * one shows what it reprices before it commits; walking the wizard a second
 * time would write four answers with none of that. It used to be open, and a
 * signed-out visitor could walk all four steps as nobody.
 *
 * `proxy.ts` turns a finished account away before this renders. The check
 * below is not a duplicate of that — the proxy's redirect is optimistic by
 * design, and this runs on the server with the session already known.
 */
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const { org, role } = await book();
  // Their own role, not the first membership row in the organisation. The
  // rule lives in `roleOf`; the reason it has to is in `lib/after-auth.ts`.
  if (org.setupDone) redirect(landingFor(role ?? "manager"));

  /*
   * The account's own currency, not the in-memory fixture's.
   *
   * `currencyCode()` reads `lib/store`, which with a project wired up is an
   * empty book that nobody is using — so this screen offered INR to an
   * organisation already holding AED. It looked right only because a brand new
   * org and the fixture happen to start on the same default.
   */
  const code = org.currency;
  const defaults = { foodCostTarget: org.foodCostTarget, rounding: org.rounding, staleAfterDays: org.staleAfterDays };
  return (
    <CurrencyProvider code={code}>
      <SetupWizard initialCurrency={code} defaults={defaults} />
    </CurrencyProvider>
  );
}

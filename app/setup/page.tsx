import { redirect } from "next/navigation";

import { SetupWizard } from "@/components/setup-wizard";
import { CurrencyProvider } from "@/components/currency-provider";

import { book } from "@/lib/book";
import { landingFor } from "@/lib/landing";
import { currencyCode } from "@/lib/store";

/**
 * The four questions, asked once after sign-up and before there is any data.
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
  const { org, members } = await book();
  if (org.setupDone) redirect(landingFor(members[0]?.role ?? "manager"));

  const code = currencyCode();
  return (
    <CurrencyProvider code={code}>
      <SetupWizard initialCurrency={code} />
    </CurrencyProvider>
  );
}

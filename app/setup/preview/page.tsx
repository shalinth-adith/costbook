import { SetupWizard } from "@/components/setup-wizard";
import { CurrencyProvider } from "@/components/currency-provider";

import { book } from "@/lib/book";

/**
 * The four screens, to look at.
 *
 * `/setup` is answered once and then turns the account away, which is right
 * for an owner and useless for anyone who wants to see the screens again. This
 * shows the same component with saving switched off. It is behind the same
 * sign-in as everything else and writes nothing, so there is nothing to gate
 * beyond that; the proxy already turns a signed-out visitor away.
 */
export const dynamic = "force-dynamic";

export default async function SetupPreviewPage() {
  const { org } = await book();
  const defaults = { foodCostTarget: org.foodCostTarget, rounding: org.rounding, staleAfterDays: org.staleAfterDays };
  return (
    <CurrencyProvider code={org.currency}>
      <SetupWizard initialCurrency={org.currency} defaults={defaults} preview />
    </CurrencyProvider>
  );
}

import { AppShell } from "@/components/app-shell";
import { PlansView } from "@/components/plans-view";

import { book } from "@/lib/book";
import { razorpayConfigured } from "@/lib/razorpay";

/**
 * Six dishes free, then a stretch of months bought here.
 *
 * Reached from the moment the seventh dish is refused, from Settings, and
 * from the reminder when a stretch is about to end. The page never changes a
 * plan by itself: it hands the choice to the provider, or to the sandbox
 * when that is switched on, and the account moves only after the server has
 * verified what came back.
 */
export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string }>;
}) {
  const b = await book();
  const { paid } = await searchParams;
  const mode = razorpayConfigured()
    ? "razorpay"
    : process.env.COSTBOOK_BILLING_SANDBOX === "true"
      ? "sandbox"
      : "none";
  return (
    <AppShell
      orgName={b.org.name}
      current="Settings"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
    >
      <PlansView
        plan={b.plan}
        subscription={b.subscription}
        recipeCount={b.recipes.length}
        role={b.role}
        mode={mode}
        justPaid={paid === "1"}
      />
    </AppShell>
  );
}

import { AppShell } from "@/components/app-shell";
import { PlansView } from "@/components/plans-view";

import { book } from "@/lib/book";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";
import { razorpayConfigured } from "@/lib/razorpay";
import { sandboxAllowed } from "@/lib/sandbox";
import { endsSoon } from '@/lib/plan';

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

  /*
   * Every payment this book has made, newest first.
   *
   * Read with the operator's own session: `payment_orders` is scoped to the
   * owner by row security, so a manager opening this page sees the plan and
   * no bills — which is A27, enforced by the policy rather than by a check
   * here that could disagree with it.
   */
  const payments = await (async () => {
    if (!supabaseConfigured()) return [];
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from("payment_orders")
      .select("id, term, amount, currency, paid_at")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(24);
    return (data ?? []) as {
      id: string;
      term: string;
      amount: number;
      currency: string;
      paid_at: string | null;
    }[];
  })();
  const mode = razorpayConfigured()
    ? "razorpay"
    : (await sandboxAllowed())
      ? "sandbox"
      : "none";
  return (
    <AppShell
      orgName={b.org.name}
      current="Settings"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
      plan={b.plan}
      planEndsIn={endsSoon(b.subscription)}
    >
      <PlansView
        plan={b.plan}
        subscription={b.subscription}
        recipeCount={b.recipes.length}
        role={b.role}
        mode={mode}
        justPaid={paid === "1"}
        payments={payments}
      />
    </AppShell>
  );
}

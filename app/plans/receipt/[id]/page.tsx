import type { Metadata } from "next";
import Link from "next/link";

import { ReceiptSheet } from "@/components/receipt-sheet";
import { book } from "@/lib/book";
import { requireSetup } from "@/lib/guard";
import { type OrderFacts, receiptOf } from "@/lib/receipt";
import { supabaseConfigured } from "@/lib/supabase/env";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Receipt · Costbook",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The receipt for one payment.
 *
 * Read with the operator's own session, which is the whole of the access
 * control: `payment_orders` is scoped to the owner by row security (A27 — a
 * manager cannot see the bill), so an id belonging to another café returns
 * nothing here rather than somebody else's document. No check of our own is
 * written, because a second check that can disagree with the policy is worse
 * than none.
 */
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSetup();
  const { id } = await params;

  const b = await book();

  const order = await (async (): Promise<OrderFacts | null> => {
    if (!supabaseConfigured()) return null;
    const supabase = await supabaseServer();
    const { data } = await supabase
      .from("payment_orders")
      .select("id, term, amount, currency, paid_at, payment_id, status")
      .eq("id", id)
      .maybeSingle();
    const row = data as {
      id: string;
      term: string;
      amount: number;
      currency: string;
      paid_at: string | null;
      payment_id: string | null;
      status: string;
    } | null;
    // An order that was opened and abandoned is not a receipt for anything.
    if (row === null || row.status !== "paid") return null;
    return {
      id: row.id,
      term: row.term,
      amount: row.amount,
      currency: row.currency,
      paidAt: row.paid_at,
      paymentId: row.payment_id,
    };
  })();

  if (order === null) {
    return (
      <main className="rc">
        <div className="rc-bar">
          <Link className="link" href="/plans">
            ← Your plan
          </Link>
        </div>
        <article className="rc-sheet">
          <h1 className="rc-title">No receipt here.</h1>
          <p className="rc-said">
            This payment is not one of yours, or it never completed. Every
            payment that did is listed under Your plan.
          </p>
        </article>
      </main>
    );
  }

  const email = await (async (): Promise<string | null> => {
    if (!supabaseConfigured()) return null;
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  })();

  return (
    <ReceiptSheet
      receipt={receiptOf({ order, orgName: b.org.name, buyerEmail: email })}
    />
  );
}

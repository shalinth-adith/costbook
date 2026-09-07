import { notFound } from "next/navigation";

import type { AccountRow, PaidOrder, Use } from "./metrics";
import { supabaseConfigured } from "./supabase/env";
import { supabaseServer } from "./supabase/server";

/**
 * The back office's own door.
 *
 * Whether somebody may see across every kitchen is answered by Postgres, not
 * by this file: `is_admin()` reads a row in `app_admins` that only the SQL
 * editor can insert, and the RLS policies added in migration 25 are what
 * actually widen what a query returns. This is the screen's copy of that
 * answer, so a page can decline before it renders — but a caller who got past
 * it would still read nothing, because the database would hand back nothing.
 *
 * A refusal is `notFound`, not a redirect and not a message. In production
 * the console does not exist for anybody who is not an admin, which is the
 * same reasoning as the dev-login route answering 404: saying "forbidden"
 * confirms there is something there to be forbidden from.
 */
export async function isAdmin(): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("is_admin");
  if (error !== null) {
    // Missing function, missing migration, no session: none of them is an
    // admin. Logged rather than thrown — a broken check must fail closed.
    console.warn("Could not check admin:", error.message);
    return false;
  }
  return data === true;
}

/** Every page under /admin starts here. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) notFound();
}

/* ── what the console reads ───────────────────────────────────────────── */

interface AccountsRow {
  org_id: string;
  name: string;
  created_at: string;
  setup_done: boolean;
  owner_email: string | null;
  plan: string;
  status: string;
  period_end: string | null;
  recipes: number | string;
  ingredients: number | string;
  last_rate_at: string | null;
  imports: number | string;
}

/**
 * One row per kitchen.
 *
 * Through `admin_accounts()` rather than a join here, because the owner's
 * address lives in `auth.users` — a table RLS does not expose and should not.
 * The function hands back one column of it to an admin and nothing else.
 */
export async function accounts(): Promise<readonly AccountRow[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("admin_accounts");
  if (error !== null) {
    console.warn("Could not read accounts:", error.message);
    return [];
  }
  return ((data ?? []) as AccountsRow[]).map((r) => ({
    orgId: r.org_id,
    name: r.name,
    createdAt: r.created_at,
    setupDone: r.setup_done,
    ownerEmail: r.owner_email,
    plan: r.plan,
    status: r.status,
    periodEnd: r.period_end,
    recipes: Number(r.recipes),
    ingredients: Number(r.ingredients),
    lastRateAt: r.last_rate_at,
    imports: Number(r.imports),
  }));
}

/** Every order that was actually paid for. */
export async function paidOrders(): Promise<readonly PaidOrder[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("payment_orders")
    .select("org_id, term, amount, currency, paid_at")
    .eq("status", "paid")
    .order("paid_at", { ascending: false });
  if (error !== null) {
    console.warn("Could not read payments:", error.message);
    return [];
  }
  return (
    (data ?? []) as {
      org_id: string;
      term: PaidOrder["term"];
      amount: number;
      currency: string;
      paid_at: string;
    }[]
  )
    .filter((o) => o.paid_at !== null)
    .map((o) => ({
      orgId: o.org_id,
      term: o.term,
      amount: Number(o.amount),
      currency: o.currency,
      paidAt: o.paid_at,
    }));
}

export interface AppError {
  readonly id: string;
  readonly at: string;
  readonly where: string;
  readonly message: string;
  readonly seen: boolean;
  readonly orgId: string | null;
}

/** What broke, newest first. */
export async function recentErrors(limit = 40): Promise<readonly AppError[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("app_errors")
    .select("id, at, at_where, message, seen, org_id")
    .order("at", { ascending: false })
    .limit(limit);
  if (error !== null) {
    console.warn("Could not read errors:", error.message);
    return [];
  }
  return (
    (data ?? []) as {
      id: string;
      at: string;
      at_where: string;
      message: string;
      seen: boolean;
      org_id: string | null;
    }[]
  ).map((e) => ({
    id: e.id,
    at: e.at,
    where: e.at_where,
    message: e.message,
    seen: e.seen,
    orgId: e.org_id,
  }));
}

export interface Thread {
  readonly id: string;
  readonly orgId: string;
  readonly subject: string;
  readonly status: "open" | "answered" | "closed";
  readonly openedAt: string;
  readonly lastAt: string;
}

/** Support threads, the ones waiting longest first. */
export async function threads(): Promise<readonly Thread[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("support_threads")
    .select("id, org_id, subject, status, opened_at, last_at")
    .order("last_at", { ascending: true });
  if (error !== null) {
    console.warn("Could not read support:", error.message);
    return [];
  }
  return (
    (data ?? []) as {
      id: string;
      org_id: string;
      subject: string;
      status: Thread["status"];
      opened_at: string;
      last_at: string;
    }[]
  ).map((t) => ({
    id: t.id,
    orgId: t.org_id,
    subject: t.subject,
    status: t.status,
    openedAt: t.opened_at,
    lastAt: t.last_at,
  }));
}

export interface ThreadWithMessages extends Thread {
  readonly messages: readonly {
    readonly id: string;
    readonly fromAdmin: boolean;
    readonly body: string;
    readonly at: string;
  }[];
}

/**
 * Threads and what was said in them, longest wait first.
 *
 * One query rather than one per thread: an inbox that fetches a conversation
 * per row is a screen that gets slower as support gets busier.
 */
export async function threadsWithMessages(): Promise<readonly ThreadWithMessages[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("support_threads")
    .select(
      "id, org_id, subject, status, opened_at, last_at, support_messages(id, from_admin, body, at)",
    )
    .order("last_at", { ascending: true });
  if (error !== null) {
    console.warn("Could not read support:", error.message);
    return [];
  }
  return (
    (data ?? []) as {
      id: string;
      org_id: string;
      subject: string;
      status: Thread["status"];
      opened_at: string;
      last_at: string;
      support_messages:
        | { id: string; from_admin: boolean; body: string; at: string }[]
        | null;
    }[]
  ).map((t) => ({
    id: t.id,
    orgId: t.org_id,
    subject: t.subject,
    status: t.status,
    openedAt: t.opened_at,
    lastAt: t.last_at,
    messages: [...(t.support_messages ?? [])]
      .sort((x, y) => x.at.localeCompare(y.at))
      .map((m) => ({ id: m.id, fromAdmin: m.from_admin, body: m.body, at: m.at })),
  }));
}

export interface ImportAttempts {
  /** Records opened at the mapping step. */
  readonly started: number;
  readonly committed: number;
  readonly undone: number;
  /**
   * Opened and never finished.
   *
   * FLOWS 10 calls import completion "the one to watch — if a user reaches
   * the mapping screen and abandons, the product has failed at its only real
   * promise". Until the record was opened at the mapping step this number
   * could not exist: somebody who uploaded, mapped, read the warnings and
   * gave up wrote no row at all.
   *
   * Only counted after an hour. A record opened three minutes ago belongs to
   * somebody still reading their warnings, and calling that an abandonment
   * would report every import in progress as a failure.
   */
  readonly abandoned: number;
  readonly inFlight: number;
}

export async function importAttempts(): Promise<ImportAttempts> {
  const nil = { started: 0, committed: 0, undone: 0, abandoned: 0, inFlight: 0 };
  if (!supabaseConfigured()) return nil;
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("imports")
    .select("status, created_at");
  if (error !== null) {
    console.warn("Could not read imports:", error.message);
    return nil;
  }

  const rows = (data ?? []) as { status: string; created_at: string }[];
  const anHourAgo = Date.now() - 3_600_000;
  const pending = rows.filter((r) => r.status === "pending");

  return {
    started: rows.length,
    committed: rows.filter((r) => r.status === "committed").length,
    undone: rows.filter((r) => r.status === "undone").length,
    abandoned: pending.filter((r) => new Date(r.created_at).getTime() < anHourAgo).length,
    inFlight: pending.filter((r) => new Date(r.created_at).getTime() >= anHourAgo).length,
  };
}

/**
 * Who came back, day by day.
 *
 * A window rather than everything: the console draws a fortnight and there is
 * no reason to carry three years of rows across the wire to do it. Ordered by
 * day so the series can be laid onto the calendar without sorting again.
 */
export async function useRows(days = 30): Promise<readonly Use[]> {
  if (!supabaseConfigured()) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("app_use")
    .select("day, org_id, user_id, logins, visits")
    .gte("day", since)
    .order("day", { ascending: true });
  if (error !== null) {
    // Before migration 27 this table does not exist, and the console should
    // say "nothing yet" rather than fall over on a screen that has four
    // other sections working.
    console.warn("Could not read use:", error.message);
    return [];
  }
  return (
    (data ?? []) as {
      day: string;
      org_id: string;
      user_id: string;
      logins: number;
      visits: number;
    }[]
  ).map((r) => ({
    day: r.day,
    orgId: r.org_id,
    userId: r.user_id,
    logins: Number(r.logins),
    visits: Number(r.visits),
  }));
}

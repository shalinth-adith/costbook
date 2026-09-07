import { supabaseConfigured } from "./supabase/env";
import { supabaseServer } from "./supabase/server";

/**
 * Mail, written now and posted when there is somewhere to post it.
 *
 * Costbook has never had a mail provider and has never pretended to have one:
 * the lockout screen offers a person rather than a reset link, and a support
 * reply lands in the product because an answer that reaches nobody is not an
 * answer. This does not change that. It adds a queue.
 *
 * Every reply is written to `mail_outbox` the moment it is sent in the
 * console — addressed, complete, and dated when it was written. Nothing is
 * posted until a key exists. The day one does, `sendQueued` drains the
 * backlog and the console stops saying "not sent".
 *
 * WHAT THIS WILL NOT DO. It will not report a message as sent that was not.
 * `sent_at` is written only after the provider has accepted it, and a refusal
 * is kept on the row so the reason is readable rather than guessed at.
 */

/** The provider's key, or null. Read here so one file knows the shape. */
function providerKey(): string | null {
  const key = process.env.RESEND_API_KEY;
  return key === undefined || key.trim() === "" ? null : key.trim();
}

/** The address mail goes out as. Falls back to the one on every screen. */
function fromAddress(): string {
  const from = process.env.MAIL_FROM;
  return from === undefined || from.trim() === ""
    ? "Costbook <hello@costbook.in>"
    : from.trim();
}

/** Whether anything can actually be posted yet. */
export function mailConfigured(): boolean {
  return providerKey() !== null;
}

export interface Queued {
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly queuedAt: string;
  readonly sentAt: string | null;
  readonly attempts: number;
  readonly lastError: string | null;
}

/**
 * Write a message down. It is not sent here, ever.
 *
 * Separating "written" from "posted" is the whole design: the console can
 * answer somebody today and be honest that the mail is waiting, rather than
 * either refusing to let you reply or claiming a send that did not happen.
 */
export async function queueMail(input: {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly threadId?: string;
}): Promise<{ readonly ok: boolean; readonly message: string }> {
  if (!supabaseConfigured()) return { ok: false, message: "Not connected." };
  if (!input.to.includes("@")) {
    // No address is a real state — a thread opened before migration 26 has
    // none — and it must not be written as a row that can never be posted.
    return { ok: false, message: "No address on file for that account." };
  }

  const supabase = await supabaseServer();
  const { error } = await supabase.from("mail_outbox").insert({
    to_email: input.to,
    subject: input.subject.slice(0, 200),
    body: input.body.slice(0, 8000),
    thread_id: input.threadId ?? null,
  });
  if (error !== null) return { ok: false, message: error.message };

  return {
    ok: true,
    message: mailConfigured()
      ? "Queued to send."
      : "Written down. It posts when the mail provider is switched on.",
  };
}

/** Everything written, newest first. */
export async function outbox(limit = 60): Promise<readonly Queued[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("mail_outbox")
    .select(
      "id, to_email, subject, body, queued_at, sent_at, attempts, last_error",
    )
    .order("queued_at", { ascending: false })
    .limit(limit);
  if (error !== null) {
    console.warn("Could not read the outbox:", error.message);
    return [];
  }
  return (
    (data ?? []) as {
      id: string;
      to_email: string;
      subject: string;
      body: string;
      queued_at: string;
      sent_at: string | null;
      attempts: number;
      last_error: string | null;
    }[]
  ).map((m) => ({
    id: m.id,
    to: m.to_email,
    subject: m.subject,
    body: m.body,
    queuedAt: m.queued_at,
    sentAt: m.sent_at,
    attempts: m.attempts,
    lastError: m.last_error,
  }));
}

/**
 * Post what is waiting.
 *
 * One at a time and oldest first, so a backlog goes out in the order it was
 * written. A refusal is recorded against the row and the drain carries on:
 * one bad address must not hold up everything queued behind it.
 *
 * `sent_at` is written only after the provider has accepted the message. A
 * row that fails keeps its null and its reason, and will be tried again.
 */
export async function sendQueued(
  limit = 25,
): Promise<{
  readonly sent: number;
  readonly failed: number;
  readonly skipped: boolean;
}> {
  const key = providerKey();
  if (key === null) return { sent: 0, failed: 0, skipped: true };
  if (!supabaseConfigured()) return { sent: 0, failed: 0, skipped: true };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("mail_outbox")
    .select("id, to_email, subject, body, attempts")
    .is("sent_at", null)
    .order("queued_at", { ascending: true })
    .limit(limit);
  if (error !== null) return { sent: 0, failed: 0, skipped: true };

  let sent = 0;
  let failed = 0;

  for (const m of (data ?? []) as {
    id: string;
    to_email: string;
    subject: string;
    body: string;
    attempts: number;
  }[]) {
    let fault: string | null = null;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [m.to_email],
          subject: m.subject,
          text: m.body,
        }),
      });
      if (!res.ok)
        fault = `${String(res.status)} ${(await res.text()).slice(0, 300)}`;
    } catch (e) {
      fault = e instanceof Error ? e.message : "could not reach the provider";
    }

    if (fault === null) {
      await supabase
        .from("mail_outbox")
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq("id", m.id);
      sent += 1;
    } else {
      // Counted and kept, not swallowed. The next drain tries it again, and
      // the count says how many times we already have.
      await supabase
        .from("mail_outbox")
        .update({ last_error: fault.slice(0, 500), attempts: m.attempts + 1 })
        .eq("id", m.id);
      failed += 1;
    }
  }

  return { sent, failed, skipped: false };
}

/**
 * How many code mails may leave, and to whom, in a window.
 *
 * WHY THIS EXISTS. Every code Costbook sends is minted with the admin API and
 * posted by Costbook itself (lib/send-code.ts). That was the right call — the
 * words are in git and a scanner cannot spend a code — but it moved a
 * guarantee off the provider and onto this application: Supabase rate-limits
 * the mail *it* sends, and it does not count the mail we send. Until this
 * file, the "send a new code" button was a public server action that would
 * post a mail to any address, as often as anybody cared to press it. The
 * 45-second countdown beside it lived in the browser, which is to say it did
 * not exist.
 *
 * The record it reads is the outbox. `sendNow` writes a row for every code
 * mail, sent or refused, so the count is durable across instances and
 * restarts — an in-memory counter on a serverless function is a counter that
 * resets whenever it would have mattered.
 *
 * Two limits, and the reason for each:
 *
 *   PER_ADDRESS — a person who asks three times in a quarter of an hour has
 *   a spam-folder problem, not a delivery problem, and a fourth mail is not
 *   the fix. It also stops one address being used to pump a stranger's inbox.
 *
 *   EVERYONE — the ceiling on what this product will post in ten minutes,
 *   whoever is asking. A sign-up form is where a mail bomb starts, and the
 *   cost of it lands on the sender's domain reputation, which is the one
 *   thing about mail that cannot be bought back quickly.
 *
 * Pure, so the arithmetic is tested without a database. The caller counts.
 */

export interface Window {
  readonly limit: number;
  readonly windowMs: number;
}

export const PER_ADDRESS: Window = { limit: 3, windowMs: 15 * 60 * 1000 };
export const EVERYONE: Window = { limit: 40, windowMs: 10 * 60 * 1000 };

/** How many code mails have already gone in each window. */
export interface Recent {
  readonly toThisAddress: number;
  readonly toAnyone: number;
}

export type Verdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "address" | "everyone" };

/**
 * Whether one more code may go out.
 *
 * The per-address check comes first because it is the one a person can be
 * told about ("you have asked three times; look in spam"); the global one is
 * ours to notice in the log, not theirs to fix.
 */
export function codeSendAllowed(recent: Recent): Verdict {
  if (recent.toThisAddress >= PER_ADDRESS.limit)
    return { ok: false, reason: "address" };
  if (recent.toAnyone >= EVERYONE.limit)
    return { ok: false, reason: "everyone" };
  return { ok: true };
}

/** The ISO instant a window opened, for a `queued_at >= …` comparison. */
export function windowStart(now: number, window: Window): string {
  return new Date(now - window.windowMs).toISOString();
}

/**
 * An address as it may appear in a log: enough to tell two apart, not enough
 * to write to. The log is the one place these flows say anything at all
 * about an address, and it should not become a list of them.
 */
export function masked(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return "<no address>";
  return `${email.slice(0, 2)}…${email.slice(at)}`;
}

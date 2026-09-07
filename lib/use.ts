import { after } from "next/server";

import { supabaseConfigured } from "./supabase/env";
import type { supabaseServer } from "./supabase/server";

/**
 * A record that somebody came back, and nothing else.
 *
 * The back office needs two numbers to know whether the product is alive:
 * how many people sign in on a given day, and how much they actually use it
 * when they do. This writes those and refuses to write anything more — no
 * route, no screen, no recipe, no action. A kitchen's contents are its own.
 *
 * Two rules keep it from costing anything the operator can feel:
 *
 *   It never blocks. Every write goes through `after`, which Next runs once
 *   the response is out of the door — including when the handler redirected,
 *   which is exactly the sign-in case. The client is built *before* the
 *   callback and handed to it: `after` runs outside the request, so a client
 *   made inside it would reach for `cookies()` where there are none, and Next
 *   refuses that outright.
 *
 *   It never writes per request. A visit is a stretch of work, not a page
 *   view: the first touch in ten minutes writes, and everything inside that
 *   window is the same visit. So a person moving through eight screens leaves
 *   one row, and the count means "about how long were they here" rather than
 *   "how chatty is our router".
 *
 * A failure is swallowed. Analytics that can break a page is worse than no
 * analytics, and this is the same discipline `reportFault` follows.
 */

/** How long one stretch of work runs before the next touch counts again. */
export const VISIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * When each person was last counted, in this process.
 *
 * Deliberately memory, not a database read: checking costs nothing and being
 * wrong costs one extra row. A second instance, or a restart, writes a second
 * visit for the same stretch — an over-count of at most one per instance per
 * ten minutes, which is a price worth paying to keep the common path free of
 * a round trip.
 */
const lastCounted = new Map<string, number>();

/** Exported for the tests; there is no reason to call this in the app. */
export function forgetVisits(): void {
  lastCounted.clear();
}

/**
 * True when this touch opens a new stretch of work.
 *
 * Pure but for the map it reads, so the window itself is testable without a
 * database, a request, or a clock nobody controls.
 */
export function opensNewVisit(userId: string, now: number): boolean {
  const last = lastCounted.get(userId);
  if (last !== undefined && now - last < VISIT_WINDOW_MS) return false;
  lastCounted.set(userId, now);

  /*
   * The map is a cache, not a record, so it is allowed to forget. Without
   * this a long-lived server would hold one entry per person who ever signed
   * in; with it, entries older than the window are dropped the next time
   * anybody arrives.
   */
  if (lastCounted.size > 500) {
    for (const [id, at] of lastCounted) {
      if (now - at >= VISIT_WINDOW_MS) lastCounted.delete(id);
    }
  }
  return true;
}

/**
 * Count a sign-in.
 *
 * Always written — a login is an event, not a stretch, and two sign-ins in a
 * minute are two sign-ins. Called from the one place that knows a password
 * was accepted, so it cannot drift out of step with what actually happened.
 */
export function noteLogin(client: Client): void {
  send(client, "login");
}

/**
 * Count a visit, if this touch begins one.
 *
 * Called from `book()`, which every screen and every action in the product
 * goes through, so there is no list of instrumented pages to keep in step.
 */
export function noteVisit(client: Client, userId: string): void {
  if (!opensNewVisit(userId, Date.now())) return;
  send(client, "visit");
}

/**
 * The caller's own client, passed in rather than made here.
 *
 * Both callers already hold one, and the one place this could have made its
 * own — inside the `after` callback — is the one place it must not.
 */
type Client = Awaited<ReturnType<typeof supabaseServer>>;

/** The one write. Never throws, never blocks, never runs without a project. */
function send(client: Client, kind: "login" | "visit"): void {
  if (!supabaseConfigured()) return;
  try {
    after(async () => {
      try {
        // `kind` is the only thing the caller decides. Who it is recorded
        // against is read from the session inside the function.
        const { error } = await client.rpc("note_use", { kind });
        // Swallowed, but not silent. A count that fails is a count we do not
        // have, and the first version of this said nothing at all — which
        // left "the table is empty" and "every write is being refused"
        // looking exactly alike from the console.
        if (error !== null) console.warn("Could not note use:", error.message);
      } catch (e) {
        console.warn("Could not note use:", e instanceof Error ? e.message : e);
      }
    });
  } catch {
    // `after` outside a request — a test, or a script. Nothing to record.
  }
}

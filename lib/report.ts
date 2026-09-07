"use server";

import { book } from "./book";
import { supabaseConfigured } from "./supabase/env";
import { supabaseServer } from "./supabase/server";

/**
 * Write a fault down.
 *
 * The error page has always told the reader "we've been told about it
 * automatically", and the only thing that happened was a `console.error` in
 * their own browser. Nobody was told anything. That sentence is now true.
 *
 * WHAT IT MUST NOT CARRY. A message and where it happened, never a payload.
 * A rate, a dish name or an address inside an error row is a kitchen's data
 * sitting outside its own account with none of the rules that protect it —
 * so the message is capped and the detail is the stack, trimmed.
 *
 * It never throws and never blocks. A reporter that can break the page it is
 * reporting on is worse than no reporter: the operator would meet a failure
 * inside the screen that exists to explain a failure.
 */
export async function reportFault(input: {
  readonly where: string;
  readonly message: string;
  readonly detail?: string;
}): Promise<void> {
  try {
    if (!supabaseConfigured()) return;

    /*
     * The org, where there is one. Read through `book()` rather than trusted
     * from the caller: this runs from a client component, and an org id that
     * arrived over the wire is an org id somebody could have chosen.
     */
    let orgId: string | null = null;
    try {
      orgId = (await book()).orgId;
    } catch {
      // A fault in the read that tells us who is signed in is exactly the
      // kind of fault worth recording. It is recorded without an account.
      orgId = null;
    }

    const supabase = await supabaseServer();
    await supabase.from("app_errors").insert({
      org_id: orgId,
      at_where: trim(input.where, 120),
      message: trim(input.message, 400),
      detail: input.detail === undefined ? null : trim(input.detail, 2000),
    });
  } catch {
    // Deliberately silent. Nothing the operator can do about a reporter that
    // cannot report, and a thrown error here would replace the page that was
    // explaining the first one.
  }
}

const trim = (s: string, n: number): string =>
  s.length <= n ? s : `${s.slice(0, n - 1)}…`;

import { createClient } from "@supabase/supabase-js";

import { supabaseEnv } from "./env";

/**
 * The one client that is not somebody's session.
 *
 * WHY THIS EXISTS, GIVEN THAT .env.example SAID IT NEVER WOULD.
 *
 * Every other path into the database carries the caller's cookie, and row
 * security scopes it to the books they own. That is the whole guarantee this
 * product makes about other people's recipes, and it held for as long as
 * every write had a person behind it.
 *
 * A webhook does not. The provider's servers post to us with no cookie, no
 * session and no user — and under row security that request is nobody, so
 * `update ... where org_id = ...` matches zero rows and SUCCEEDS. Nothing
 * raises, nothing is written, and the money is already taken. The rule had to
 * change or the callback had to stay broken; there is no third option, because
 * Supabase's data API offers exactly three roles and only one of them can act
 * without a session.
 *
 * WHAT KEEPS IT NARROW:
 *
 *   - One importer. `lib/settle.ts`, which is imported by one route handler.
 *     Nothing rendered for a person ever reaches this file.
 *   - No fallback. A missing key throws rather than quietly degrading to the
 *     anon client, because degrading here means "writes nothing, says fine",
 *     which is the exact bug being fixed.
 *   - Server only. No NEXT_PUBLIC_ prefix, so it cannot reach a bundle; Next
 *     inlines only NEXT_PUBLIC_ names into client code.
 *   - It settles orders and touches nothing else. Everything a person can see
 *     or change still goes through their own session and their own policies.
 *
 * If this key leaks, row security is not a defence against whoever holds it.
 * That is the cost, it is written down here rather than discovered later, and
 * it is the price of a callback that cannot lose a payment.
 */

export class MissingServiceKey extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY is not set, so the payment callback cannot " +
        "settle an order. Take it from Project Settings → API Keys → " +
        "service_role, put it in .env.local, and restart — env is read at " +
        "boot, not per request.",
    );
    this.name = "MissingServiceKey";
  }
}

export function serviceKeyPresent(): boolean {
  return (process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "") !== "";
}

export function supabaseAdmin() {
  const { url } = supabaseEnv();
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (key === "") throw new MissingServiceKey();

  /*
   * No session handling at all, and deliberately so. `persistSession` would
   * have this client writing tokens to a store it shares with nobody, and
   * `autoRefreshToken` would start a timer in a process that handles one
   * request and moves on. Neither is wanted: the key is the credential.
   */
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

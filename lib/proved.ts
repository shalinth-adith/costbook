import { CODE_MINUTES } from "./recover";

/**
 * Whether a session was earned by typing a code, recently.
 *
 * WHY THIS IS ASKED. /reset/new changes the password of whoever the session
 * belongs to and takes no address and no code — the code was typed on the
 * screen before it, and the session is the proof. That is the right design,
 * but it made the screen a door for any session at all: somebody signed in
 * with a password, at an unlocked laptop, could open /reset/new and set a
 * new password without knowing the old one. The audit of 2026-09-15 found
 * it open to a plain sign-in.
 *
 * WHAT IS CHECKED. Supabase stamps every session with how it was earned
 * (the `amr` claim): a password sign-in says `password`, and a code — a
 * recovery code and a sign-up code alike — says `otp`, with the second it
 * happened. Only the second kind, and only within the hour a code lasts
 * (CODE_MINUTES), may choose a password here. A session that has lived on
 * refresh for a week since its code is a signed-in session like any other,
 * and is sent to ask for a code again.
 *
 * The pure half decides; the server half reads the claim from the session.
 */

export const PROOF_WINDOW_MS = CODE_MINUTES * 60 * 1000;

/** One entry of the `amr` claim, in either shape the client reports it. */
export type Method =
  string | { readonly method: string; readonly timestamp: number };

export function provedByCode(methods: readonly Method[], now: number): boolean {
  let newest: number | null = null;
  for (const m of methods) {
    if (typeof m === "string") {
      // The bare form carries no time, so it cannot be judged recent. Refuse:
      // the cost of a wrong "no" is one more code; the cost of a wrong "yes"
      // is somebody else's password.
      continue;
    }
    if (m.method !== "otp") continue;
    // Seconds since the epoch, as the claim gives it.
    const at = m.timestamp * 1000;
    if (newest === null || at > newest) newest = at;
  }
  if (newest === null) return false;
  return now - newest <= PROOF_WINDOW_MS;
}

/**
 * The server half. Any client from lib/supabase/server.ts carries the
 * caller's session; the assurance-level call decodes its claim without a
 * round trip.
 */
export async function sessionProvedByCode(client: {
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel: () => Promise<{
        data: { currentAuthenticationMethods: readonly Method[] } | null;
      }>;
    };
  };
}): Promise<boolean> {
  const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data === null) return false;
  return provedByCode(data.currentAuthenticationMethods, Date.now());
}

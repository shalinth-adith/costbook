import { codeLetter } from "./codes";
import { sendNow } from "./post";
import { supabaseAdmin } from "./supabase/admin";

/**
 * Getting a code from the provider and posting it ourselves.
 *
 * WHY THIS EXISTS. Supabase can send these mails from a template in its
 * dashboard, and for a week it did: the template said "follow this link"
 * while the screen asked for six digits, and nothing in this repository could
 * make the two agree. A template is also unversioned, untested, and invisible
 * to anybody reading the code.
 *
 * `generateLink` exists for exactly this — its own documentation says the raw
 * `email_otp` is "the raw email OTP… send this in the email if you want your
 * users to verify using an OTP instead of the action link". Supabase remains
 * the authority on the token; only the envelope is ours.
 *
 * ONE TOKEN FAMILY FOR SIGNING UP. Creating the account and asking again
 * later for a fresh code are different calls — `signup` needs the password,
 * a resend has no password to give — so both end on a `magiclink` code, and
 * the screen verifies exactly one type. Verifying it confirms the address,
 * which is the whole job.
 *
 * NOTHING HERE REVEALS WHETHER AN ADDRESS EXISTS. Every path returns the same
 * shape whatever the provider said; the caller says the same sentence either
 * way.
 */

/** A code that proves an address, for a new account or a returning one. */
export async function sendSignupCode(input: {
  readonly email: string;
  /** Given only when the account is being created. */
  readonly password?: string;
}): Promise<{ readonly ok: boolean; readonly exists: boolean }> {
  let supabase: ReturnType<typeof supabaseAdmin>;
  try {
    supabase = supabaseAdmin();
  } catch (error) {
    console.error("[auth] no service key, so no code was sent:", String(error));
    return { ok: false, exists: false };
  }

  let exists = false;

  if (input.password !== undefined) {
    const made = await supabase.auth.admin.generateLink({
      type: "signup",
      email: input.email,
      password: input.password,
    });
    if (made.error !== null) {
      const said = made.error.message.toLowerCase();
      // Already registered. Said to the caller, never to the screen.
      exists = said.includes("already") || said.includes("registered");
      if (!exists) {
        console.error("[auth] could not create the account:", made.error.message);
        return { ok: false, exists: false };
      }
    }
  }

  /*
   * A second call, and a deliberate one.
   *
   * The signup link carries a code of its own, but a resend cannot produce
   * one without the password. Asking for a magiclink code in both cases means
   * the screen verifies a single type rather than guessing which arrived.
   */
  const code = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: input.email,
  });
  if (code.error !== null || code.data.properties === null) {
    console.error("[auth] could not generate a code:", code.error?.message);
    return { ok: false, exists };
  }

  const out = await sendNow(
    input.email,
    codeLetter({ code: code.data.properties.email_otp, purpose: "signup" }),
  );
  return { ok: out.ok, exists };
}

/** A code that lets somebody set a new password. */
export async function sendRecoveryCode(email: string): Promise<boolean> {
  try {
    const supabase = supabaseAdmin();
    const code = await supabase.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    /*
     * An address with no account errors here, and that is the end of it: the
     * screen says the same sentence it says to everybody. Logged, not shown —
     * a form that answers differently is a form for discovering who has an
     * account.
     */
    if (code.error !== null || code.data.properties === null) {
      console.warn(`[auth] no recovery code generated: ${code.error?.message ?? "no properties"}`);
      return false;
    }
    const out = await sendNow(
      email,
      codeLetter({ code: code.data.properties.email_otp, purpose: "recovery" }),
    );
    return out.ok;
  } catch (error) {
    console.error("[auth] could not send a recovery code:", String(error));
    return false;
  }
}

import {
  EVERYONE,
  PER_ADDRESS,
  type Recent,
  codeSendAllowed,
  masked,
  windowStart,
} from "./code-throttle";
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
 * TWO THINGS THE PROVIDER WILL NOT DO FOR US, so this file does them:
 *
 *   It asks whether an address has an account before minting a magic-link
 *   code for it, because the provider's answer to "a magic link for an
 *   address with no account" is to create the account. Found by the audit of
 *   2026-09-15: "send a new code" was a public button that made sign-ins,
 *   with organisations, for any address typed at it.
 *
 *   It counts. The provider rate-limits the mail it sends and not the mail
 *   we send, so the count lives here, read from the outbox — see
 *   lib/code-throttle.ts for the limits and the reasons.
 *
 * NOTHING HERE REVEALS WHETHER AN ADDRESS EXISTS. Every path returns the same
 * shape whatever the provider said; the caller says the same sentence either
 * way. An address with no account is answered `ok` with nothing sent, the
 * same as a working send, because "that did not send" to one address and
 * silence to another is a way of telling them apart.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

/** Every code mail carries this subject shape (lib/codes.ts), so it can be counted. */
const CODE_SUBJECT = "% is your Costbook code";

/**
 * Whether an address has a sign-in. Null when the question could not be
 * asked, which the caller treats as "do not send" — minting a code for an
 * address we could not check is the very thing this guards against.
 */
async function accountExists(
  supabase: Admin,
  email: string,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("email_has_account", {
    address: email,
  });
  if (error !== null) {
    console.error(
      "[auth] could not check whether the address has an account:",
      error.message,
    );
    return null;
  }
  return data === true;
}

/** Code mails already posted in each window, counted from the outbox. */
async function recentCodeMail(
  supabase: Admin,
  email: string,
  now: number,
): Promise<Recent | null> {
  const [mine, everyone] = await Promise.all([
    supabase
      .from("mail_outbox")
      .select("id", { count: "exact", head: true })
      .eq("to_email", email)
      .like("subject", CODE_SUBJECT)
      .gte("queued_at", windowStart(now, PER_ADDRESS)),
    supabase
      .from("mail_outbox")
      .select("id", { count: "exact", head: true })
      .like("subject", CODE_SUBJECT)
      .gte("queued_at", windowStart(now, EVERYONE)),
  ]);
  if (mine.error !== null || everyone.error !== null) {
    console.error(
      "[auth] could not count recent code mail:",
      mine.error?.message ?? everyone.error?.message,
    );
    return null;
  }
  return { toThisAddress: mine.count ?? 0, toAnyone: everyone.count ?? 0 };
}

/**
 * Whether one more code may leave for this address right now.
 *
 * Refuses when it cannot count, on purpose. A throttle that opens when its
 * record is unreadable is a throttle that opens under exactly the load it
 * was built for.
 */
async function mayPost(supabase: Admin, email: string): Promise<boolean> {
  const recent = await recentCodeMail(supabase, email, Date.now());
  if (recent === null) return false;
  const verdict = codeSendAllowed(recent);
  if (!verdict.ok) {
    console.warn(
      `[auth] code to ${masked(email)} refused: ${verdict.reason} limit reached`,
    );
  }
  return verdict.ok;
}

/** A code that proves an address, for a new account or a returning one. */
export async function sendSignupCode(input: {
  readonly email: string;
  /** Given only when the account is being created. */
  readonly password?: string;
}): Promise<{ readonly ok: boolean; readonly exists: boolean }> {
  let supabase: Admin;
  try {
    supabase = supabaseAdmin();
  } catch (error) {
    console.error("[auth] no service key, so no code was sent:", String(error));
    return { ok: false, exists: false };
  }

  // The provider lowercases addresses; matching it keeps the outbox count
  // and the lookup on the same string the account is under.
  const email = input.email.trim().toLowerCase();

  let exists = false;

  if (input.password !== undefined) {
    const made = await supabase.auth.admin.generateLink({
      type: "signup",
      email,
      password: input.password,
    });
    if (made.error !== null) {
      const said = made.error.message.toLowerCase();
      // Already registered. Said to the caller, never to the screen.
      exists = said.includes("already") || said.includes("registered");
      if (!exists) {
        console.error(
          "[auth] could not create the account:",
          made.error.message,
        );
        return { ok: false, exists: false };
      }
    }
  } else {
    /*
     * A resend has no password, so the account cannot be created here — and
     * must not be created by the magic-link call below either. An address
     * with no sign-in gets nothing, and is told nothing.
     */
    const found = await accountExists(supabase, email);
    if (found === null) return { ok: false, exists: false };
    if (!found) return { ok: true, exists: false };
    exists = true;
  }

  if (!(await mayPost(supabase, email))) return { ok: false, exists };

  /*
   * A second call, and a deliberate one.
   *
   * The signup link carries a code of its own, but a resend cannot produce
   * one without the password. Asking for a magiclink code in both cases means
   * the screen verifies a single type rather than guessing which arrived.
   */
  const code = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (code.error !== null || code.data.properties === null) {
    console.error("[auth] could not generate a code:", code.error?.message);
    return { ok: false, exists };
  }

  /*
   * Which letter. Somebody creating an account on an address that already
   * has one gets a code that signs them in, and a letter that says so —
   * the code mail a second sign-up used to send said "finish signing up" to
   * a person who had finished months ago, with nowhere to type it.
   */
  const purpose = input.password !== undefined && exists ? "signin" : "signup";

  const out = await sendNow(
    email,
    codeLetter({ code: code.data.properties.email_otp, purpose }),
  );
  return { ok: out.ok, exists };
}

/** A code that lets somebody set a new password. */
export async function sendRecoveryCode(email: string): Promise<boolean> {
  try {
    const supabase = supabaseAdmin();
    const address = email.trim().toLowerCase();

    if (!(await mayPost(supabase, address))) return false;

    const code = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: address,
    });
    /*
     * An address with no account errors here, and that is the end of it: the
     * screen says the same sentence it says to everybody. Logged, not shown —
     * a form that answers differently is a form for discovering who has an
     * account.
     */
    if (code.error !== null || code.data.properties === null) {
      console.warn(
        `[auth] no recovery code generated: ${code.error?.message ?? "no properties"}`,
      );
      return false;
    }
    const out = await sendNow(
      address,
      codeLetter({ code: code.data.properties.email_otp, purpose: "recovery" }),
    );
    return out.ok;
  } catch (error) {
    console.error("[auth] could not send a recovery code:", String(error));
    return false;
  }
}

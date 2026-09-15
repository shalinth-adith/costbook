import type { Letter } from "./letters";
import { SUPPORT_EMAIL } from "./org";
import { CODE_MINUTES } from "./recover";

/**
 * The mail that carries a code.
 *
 * WRITTEN HERE, NOT IN A DASHBOARD. Supabase can send these itself from a
 * template, and for a week it did — and every time the template said "follow
 * this link" while the screen asked for six digits, because the two live in
 * different places and nothing can make them agree. A template is also
 * untested, unversioned, and invisible to anybody reading this repository.
 *
 * So Costbook asks the provider for the code (`generateLink` returns
 * `email_otp` precisely so it can be sent by a custom provider) and posts the
 * mail itself. The words are in git, they are tested, and the screen and the
 * message cannot drift apart.
 */

/**
 * Why a code was sent. The flows differ in a sentence, not in shape.
 *
 * `signin` is the letter for somebody who tried to create an account on an
 * address that already has one. The code they get signs them in, and the
 * letter says so — the alternative, a "finish signing up" mail to a person
 * who finished months ago, was what the audit of 2026-09-15 found going out.
 */
export type Purpose = "signup" | "recovery" | "signin";

export function codeLetter(input: {
  readonly code: string;
  readonly purpose: Purpose;
}): Letter {
  const why =
    input.purpose === "signup"
      ? "to finish signing up"
      : input.purpose === "recovery"
        ? "to choose a new password"
        : "to sign in";

  /*
   * Said only to the person who already has the account. It is not a leak:
   * the letter goes to the address itself, and whoever typed it into the
   * sign-up form sees the same code screen as everybody else.
   */
  const already =
    input.purpose === "signin"
      ? "Somebody — most likely you — just tried to create a Costbook account with this " +
        "address, and it already has one. There is no second account to make: type the " +
        "code into that screen and you are signed in to the one you have.\n\n"
      : "";

  return {
    subject: `${input.code} is your Costbook code`,
    /*
     * The code is in the subject as well as the body.
     *
     * A phone shows the subject on the lock screen, so somebody typing into
     * the other hand never has to open the message at all — which is the
     * whole advantage a code has over a link, and it is lost if the subject
     * says only "Confirm your email address".
     */
    body:
      `${input.code}\n\n` +
      `That is your Costbook code, ${why}. Type it into the screen you came from.\n\n` +
      already +
      `It lasts ${String(CODE_MINUTES)} minutes and can be used once. Nobody at Costbook will ` +
      `ever ask you for it.\n\n` +
      /*
       * Said because the provider cannot say it.
       *
       * The code lives in one column on the account, so asking for another
       * overwrites the one before it — and a stale code is refused with the
       * same words as an expired one. Somebody looking at two of our mails has
       * no way to tell which is live unless we tell them here.
       */
      `Asked more than once? Only the newest code works — this one, if it is the ` +
      `most recent mail from us.\n\n` +
      `If you did not ask for this, nothing has happened to your account and you can ignore ` +
      `this message.\n\n` +
      `— Costbook · ${SUPPORT_EMAIL}`,
  };
}

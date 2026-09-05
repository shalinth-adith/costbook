import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/wordmark";

import "../legal.css";

export const metadata: Metadata = {
  title: "Contact · Costbook",
  description:
    "Write to the people who build Costbook. We usually reply within a day.",
};

/**
 * The page behind "Contact a human" on the sign-in screen.
 *
 * It 404'd, which is the worst place in the product for a 404: it is reached
 * by someone who is already locked out, has already decided the software is
 * the problem, and has not yet decided to trust it.
 *
 * The link says "a human", so this is not a help centre. No form, no chat
 * widget, no ticket number — a form is a way of not giving someone an address,
 * and the whole promise of that link is the address. It names who reads it and
 * says how long a reply takes, because a stranger writing to a founder's inbox
 * has no idea whether that is a day or a fortnight.
 *
 * No WhatsApp number until there is one somebody actually watches. An
 * unanswered WhatsApp is worse than no WhatsApp: it looks like a faster door
 * and it is a slower one.
 */
export default function Contact() {
  return (
    <div className="legal is-narrow">
      <header className="legal-top">
        <Wordmark mode="public" />
      </header>

      <main>
        <h1>Write to us.</h1>
        <p>
          Costbook is made by a small team, and the address below
          reaches us rather than a help desk. We usually reply within a day.
        </p>

        <section>
          <h2>Anything at all</h2>
          <p>
            <a href="mailto:hello@costbook.in">hello@costbook.in</a> — locked
            out, a figure that looks wrong, a sheet that would not import, or a
            question about whether this suits your kitchen. If something is
            costing wrong, send the dish name and what you expected; that is
            usually enough for us to find it.
          </p>
        </section>

        <section>
          <h2>If you cannot get in</h2>
          <p>
            Write from the address you signed up with if you can — it is the
            fastest way for us to find the account. If you cannot reach that
            inbox either, say so and we will work it out with you.
          </p>
        </section>

        <div className="legal-actions">
          <Link href="/sign-in" className="btn btn-primary">
            Back to sign in
          </Link>
          <a href="mailto:hello@costbook.in" className="btn">
            Email us
          </a>
        </div>
      </main>

      <footer className="legal-foot">
        <Link href="/">Back to Costbook</Link>
        <a href="mailto:hello@costbook.in">hello@costbook.in</a>
      </footer>
    </div>
  );
}

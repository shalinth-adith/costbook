import type { Metadata } from "next";
import Link from "next/link";

import { PublicBar } from "@/components/public-bar";

export const metadata: Metadata = {
  title: "Contact · Costbook",
  description:
    "Write to the people who build Costbook. One address, read by a person, answered within a day.",
};

/**
 * The page behind "Contact a human".
 *
 * It 404'd once, which is the worst place in the product for a 404: it is
 * reached by someone who is already locked out, has already decided the
 * software is the problem, and has not yet decided to trust it.
 *
 * The link says "a human", so this is not a help centre. No form, no chat
 * widget, no ticket number — a form is a way of not giving someone an
 * address, and the whole promise of that link is the address. It names who
 * reads it and says how long a reply takes, because a stranger writing to a
 * founder's inbox has no idea whether that is a day or a fortnight.
 *
 * Built on the legal pages' frame — soot header, four facts, numbered
 * sections — so it reads as a page of the same book rather than a leftover.
 * The sections are the four reasons anybody actually writes, each with what
 * to put in the mail so the first reply is the answer rather than a question.
 *
 * No WhatsApp number until there is one somebody actually watches. An
 * unanswered WhatsApp is worse than no WhatsApp: it looks like a faster door
 * and it is a slower one.
 */

const MAIL = "hello@costbook.in";

const FACTS: readonly { n: string; said: string }[] = [
  {
    n: "1",
    said: "address, and it reaches the people who build this — not a help desk",
  },
  { n: "24h", said: "is how long a reply usually takes, on a working day" },
  {
    n: "0",
    said: "forms, ticket numbers or chat widgets between you and a person",
  },
  {
    n: "7",
    said: "days to undo a price list, if the mail is about one that went wrong",
  },
];

const REASONS: readonly { h: string; p: React.ReactNode; send: string }[] = [
  {
    h: "A figure looks wrong",
    p: (
      <>
        Every figure in the book can be opened to show its working, so most of
        the time the answer is on the screen — a yield that was entered as 100%,
        a rate that was typed per pack rather than per kilo. If it still looks
        wrong after that, write. A costing that is wrong is a bug on our side
        until we have shown otherwise.
      </>
    ),
    send: "The dish name, the figure you see, and the figure you expected.",
  },
  {
    h: "A sheet would not come in",
    p: (
      <>
        Costbook reads spreadsheets and CSVs as they are, and asks once which
        column is which. A file it cannot read is our fault, not yours — send
        it, exactly as it is, and we will make the import understand it. Your
        file is only ever read; nothing in it is altered.
      </>
    ),
    send: "The file itself, and what the columns mean if the headers are your own shorthand.",
  },
  {
    h: "You cannot get in",
    p: (
      <>
        There is no reset link yet, so the way back in is a person.
        Write from the address you signed up with if you can, because that is
        the fastest way for us to find the account. If you cannot reach that
        inbox either, say so and we will work it out with you.
      </>
    ),
    send: "The address you signed up with, and the name of your restaurant as you entered it.",
  },
  {
    h: "Whether it suits your kitchen",
    p: (
      <>
        Ask. Six dishes are free for good, which is usually enough to find out;
        but if your menu has a shape we have not seen — a bakery pricing by the
        tray, a cloud kitchen with four brands on one shelf — a sentence about
        it now saves an evening of entering things.
      </>
    ),
    send: "What you sell, how many dishes, and what you use for costing today.",
  },
];

export default function Contact() {
  return (
    <div className="lg">
      <PublicBar />

      <section className="lg-hero">
        <p className="lg-eyebrow">Contact · a person reads this</p>
        <h1 className="lg-h1">Write to us.</h1>
        <p className="lg-summary">
          Costbook is made by a small team, and the address below reaches us
          rather than a help desk. Say what you were trying to do and what
          happened; we usually reply within a day.
        </p>
        <p className="lg-note">
          <a className="ct-mail" href={`mailto:${MAIL}`}>
            {MAIL}
          </a>
        </p>
      </section>

      <section className="lg-facts rv" aria-label="What to expect">
        <dl>
          {FACTS.map((f) => (
            <div key={f.said} className="lg-fact">
              <dt className="figure">{f.n}</dt>
              <dd>{f.said}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="lg-body">
        <nav className="lg-toc" aria-label="On this page">
          <p className="lg-toc-h">Why people write</p>
          <ol>
            {REASONS.map((r, i) => (
              <li key={r.h}>
                <a href={`#reason-${String(i + 1)}`}>
                  <span className="figure">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{r.h}</span>
                </a>
              </li>
            ))}
            <li>
              <a href="#inside">
                <span className="figure">05</span>
                <span>Already inside?</span>
              </a>
            </li>
          </ol>
        </nav>

        <div className="lg-sections">
          {REASONS.map((r, i) => (
            <section
              key={r.h}
              id={`reason-${String(i + 1)}`}
              className="lg-section rv"
            >
              <span className="figure lg-section-n">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h2 className="lg-h2">{r.h}</h2>
              <p className="lg-p">{r.p}</p>
              <p className="ct-send">
                <span className="figure">Send</span>
                {r.send}
              </p>
            </section>
          ))}

          <section id="inside" className="lg-section rv">
            <span className="figure lg-section-n">05</span>
            <h2 className="lg-h2">Already inside?</h2>
            <p className="lg-p">
              Ask from the <Link href="/help">Help page</Link> instead. The
              reply lands on that page, in your account, so you need not watch
              an inbox — and it arrives knowing which kitchen you are, which
              saves the first round of questions.
            </p>
          </section>

          <div className="ct-actions">
            <a href={`mailto:${MAIL}`} className="ct-btn">
              Write to {MAIL}
              <span aria-hidden="true">→</span>
            </a>
            <Link href="/sign-in" className="ct-back">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>

      <footer className="lg-foot">
        <div>
          <p className="lg-foot-mark">Costbook</p>
          <p className="lg-foot-said">
            Recipe costing for one kitchen. One ingredient, entered once, priced
            once — and the people who built it, one address away.
          </p>
        </div>
        <p className="lg-foot-links">
          <a href={`mailto:${MAIL}`}>{MAIL}</a>
          <Link href="/about">What this is</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </p>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { PublicBar } from "@/components/public-bar";
import { SUPPORT_EMAIL } from "@/lib/org";

import "../legal.css";

export const metadata: Metadata = {
  title: "Your account is closed · Costbook",
  // Nothing to index: this page is only meaningful to the one person who has
  // just arrived on it, and only for the minute they are reading it.
  robots: { index: false, follow: false },
};

/**
 * Where closing an account lands.
 *
 * Public, and it has to be: by the time anybody reads this their session is
 * gone and so is the account behind it, so a gated page would answer the one
 * person it was written for with a sign-in screen for a sign-in that no
 * longer exists.
 *
 * It says what happened in the past tense and does not ask for anything. No
 * "are you sure", no offer to come back, no survey — the decision was made on
 * the last screen and this one is a receipt.
 */
export default function Gone() {
  return (
    <div className="lg">
      <PublicBar />

      <section className="lg-hero">
        <p className="lg-eyebrow">Closed</p>
        <h1 className="lg-h1">That is done.</h1>
        <p className="lg-summary">
          Your book, every dish and rate in it, its history, and the sign-in
          that opened it have all been deleted. Nothing was kept, and there is
          no copy waiting to tempt you back.
        </p>
      </section>

      <div className="lg-body">
        <div className="lg-sections">
          <section className="lg-section">
            <span className="figure lg-section-n">01</span>
            <h2 className="lg-h2">What is left</h2>
            <div className="lg-p">
              <p>
                A record that Costbook once had an error, if it ever did, with
                no account attached and nothing in it about your kitchen — a
                message and a route, never a rate or a dish name. If you paid
                for anything, the payment provider keeps its own record of it,
                because that is their obligation and not ours to erase.
              </p>
            </div>
          </section>

          <section className="lg-section">
            <span className="figure lg-section-n">02</span>
            <h2 className="lg-h2">If this was a mistake</h2>
            <div className="lg-p">
              <p>
                There is nothing to restore. Signing up again makes a new book,
                empty, from the beginning — which is the honest consequence of
                keeping no copy.
              </p>
            </div>
          </section>

          <section className="lg-section">
            <span className="figure lg-section-n">03</span>
            <h2 className="lg-h2">If something was wrong with it</h2>
            <div className="lg-p">
              <p>
                We would rather know than not:{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. You do
                not owe us a reason, and there is no account left for an answer
                to change.
              </p>
            </div>
          </section>
        </div>
      </div>

      <footer className="lg-foot">
        <div>
          <p className="lg-foot-mark">Costbook</p>
          <p className="lg-foot-said">Thank you for trying it.</p>
        </div>
        <p className="lg-foot-links">
          <Link href="/">Costbook</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </p>
      </footer>
    </div>
  );
}

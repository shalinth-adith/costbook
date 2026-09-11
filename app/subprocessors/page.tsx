import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";

import "../legal.css";

export const metadata: Metadata = {
  title: "Who else touches it · Costbook",
  description:
    "Every company that processes anything you put into Costbook, what each one holds, and where it sits.",
};

/**
 * The list the privacy policy promised.
 *
 * Privacy says "They are listed at costbook.in/subprocessors", and for a long
 * while that sentence pointed at nothing. A policy that names a page which
 * does not exist is worse than one that never mentioned it: the reader who
 * goes looking is the reader who cared.
 *
 * WHEN THIS PAGE IS WRONG, IT IS WRONG IN A WAY THAT MATTERS. It is a
 * statement about where other people's data goes. Anything added between
 * Costbook and a customer — a host, a log shipper, an error tracker, an
 * analytics script, a support desk, a queue — belongs in the table below the
 * day it is added, not the day somebody asks.
 *
 * STILL TO ADD: wherever the application itself ends up hosted. Right now
 * there is no deployment config in this repository, so the only place the
 * data sits is Supabase. The moment the app runs on somebody's machines,
 * those machines see every request and that company is a fourth row here.
 */

/** One company, and the four things a reader wants about it. */
interface Processor {
  readonly name: string;
  readonly does: string;
  readonly holds: string;
  readonly where: string;
}

const PROCESSORS: readonly Processor[] = [
  {
    name: "Supabase",
    does: "The database and the sign-in",
    holds:
      "Your email address and business name, and everything you enter or import: recipes, sub-recipes, ingredients, rates and their history, sales you paste in, and support threads. An imported file is kept for thirty days so an import can be undone.",
    where: "Mumbai, India (ap-south-1)",
  },
  {
    name: "Resend",
    does: "Sends the mail Costbook writes to you",
    holds:
      "The address a message goes to and what the message says — a support reply, or a note that a stretch is ending. Nothing about your recipes travels in one.",
    where: "United States",
  },
  {
    name: "Razorpay",
    does: "Takes the payment",
    holds:
      "What you paid, for which stretch, and the card or UPI details you give their form. Costbook never receives a card number: we keep their order id and payment id, and nothing else.",
    where: "India",
  },
];

export default function Subprocessors() {
  return (
    <LegalPage
      title="Who else touches it"
      changed="11 September 2026"
      note="The list the privacy policy points at, in full."
      summary="Three companies process anything you put into Costbook, and this is all of them: where the servers are, who sends our email, and who takes the payment. No advertising company, no analytics company, and no data broker is on this list, and none will be added without telling you first."
      facts={[
        { n: "3", said: "companies touch anything you enter" },
        { n: "0", said: "advertising, analytics or data brokers among them" },
        { n: "0", said: "card numbers Costbook has ever seen" },
        { n: "30", said: "days an imported file is kept, so an import can be undone" },
      ]}
      sections={[
        {
          h: "The list",
          p: (
            <div className="lg-tablewrap">
              <table className="lg-table">
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    <th scope="col">What it does</th>
                    <th scope="col">What it holds</th>
                    <th scope="col">Where</th>
                  </tr>
                </thead>
                <tbody>
                  {PROCESSORS.map((p) => (
                    <tr key={p.name}>
                      <th scope="row">{p.name}</th>
                      <td>{p.does}</td>
                      <td>{p.holds}</td>
                      <td className="lg-where">{p.where}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        },
        {
          h: "Where your book actually sits",
          p: "In Mumbai. The database is in Supabase's ap-south-1 region, which was chosen because most of the kitchens using this are in India and their data has no reason to leave it. Every recipe, rate and figure you see on a screen is read from there. Nothing is copied to a second region, and nothing is mirrored anywhere for analysis.",
        },
        {
          h: "Your card",
          p: "Costbook has no card form and never has. When you buy a stretch, Razorpay's own form opens over the page and the card goes straight to them — the number never reaches our servers and there is nothing here to leak. What we keep is their order id, their payment id, and what the order was for.",
        },
        {
          h: "What none of them get",
          p: "Your rates are not pooled into a market average, sold to suppliers, or used to train anything. There is no advertising pixel, no session recorder and no third-party analytics script on any screen, signed in or out. The only thing the back office counts is how many accounts signed in and how many visited — never what a kitchen holds or cooks.",
        },
        {
          h: "When this list changes",
          p: (
            <>
              Anything added between you and Costbook — a host, an error
              tracker, a support desk, a queue — is added to the table above on
              the day it starts, and the date at the top of this page moves
              with it. If a change means somebody new holds your recipes, you
              get an email about it before it happens, not after.
            </>
          ),
        },
        {
          h: "Questions",
          p: (
            <>
              If a row here reads like it is hiding something, ask and we will
              rewrite it: <a href="mailto:hello@costbook.in">hello@costbook.in</a>.
              The rest of what we hold and why is on the{" "}
              <Link href="/privacy">privacy page</Link>.
            </>
          ),
        },
      ]}
    />
  );
}

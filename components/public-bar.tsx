import Link from "next/link";

import { signedIn } from "@/lib/book";

import { Wordmark } from "./wordmark";

/**
 * One bar for every public page.
 *
 * About, Contact, Privacy and Terms each carried their own header — a mark
 * and a "Back to Costbook" — which is a second navigation vocabulary for
 * somebody who has just left the landing page's. Same items, same order,
 * same ground as the entry screen, so a visitor moving between them is never
 * asked to learn the building twice.
 *
 * No "Back to Costbook": the mark already goes there, on every screen in the
 * product, and a second control to the same place is the duplication A34
 * names. Nor does the action hide the way the landing bar's does — there the
 * hero carries one already and two at once is a competition; these pages
 * have no hero, so the one ask is offered from the first line.
 */
export async function PublicBar() {
  /*
   * These pages are reached from inside the product as well as from outside
   * it: the wordmark in the application leads to About. A person who is
   * already signed in was then offered "Sign in" and "Start free", which does
   * not read as an invitation — it reads as having been signed out. The
   * owner's report was exactly that: pressing the logo meant signing in
   * again.
   *
   * So the bar asks. Signed in, the only ways out of the product stay the
   * ones the product owns — the account menu's Sign out — and this offers the
   * way back to the book instead.
   */
  const inside = await signedIn();

  return (
    <header className="pb">
      <Wordmark mode="public" home={inside ? "/dashboard" : undefined} />
      <nav className="pb-links" aria-label="Site">
        <Link href="/about" className="pb-link pb-tight">
          What this is
        </Link>
        <Link href="/contact" className="pb-link pb-wide">
          Contact
        </Link>
        {inside ? (
          <Link href="/dashboard" className="pb-cta">
            Back to your book
          </Link>
        ) : (
          <>
            <Link href="/sign-in" className="pb-link">
              Sign in
            </Link>
            <Link href="/sign-up" className="pb-cta">
              Start free
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

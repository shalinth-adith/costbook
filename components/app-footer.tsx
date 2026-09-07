import Link from "next/link";

import { Mark } from "./mark";

/**
 * The end of the page, on soot.
 *
 * Every screen used to stop dead at its last line — the dashboard finished on
 * "What changed lately" with nothing under it, which reads as a page that was
 * cut rather than one that ended. This is what ends it: a map of the product,
 * where to find a person, and the mark, on the dark floor from The Kitchen
 * Palette so the eye can tell the page has finished rather than scrolled out.
 *
 * Every link goes somewhere that exists. The proposal mocked a "Costbook for"
 * column of cafés and cloud kitchens; those pages are not built, and a footer
 * link to nothing is worse than a shorter footer. Likewise no phone number or
 * postal address — none has been given to us to print, and a plausible one
 * would be exactly the quiet wrongness this product exists to remove.
 */
export function AppFooter() {
  return (
    <footer className="foot">
      <div className="foot-top">
        <div>
          <div className="foot-brand">
            <Mark size={24} />
            <span>Costbook</span>
          </div>
          <p className="foot-line">
            Recipe costing for one kitchen.{" "}
            <b>One ingredient, entered once, priced once</b> — change what you
            pay for onions and every dish that reaches them recosts.
          </p>
        </div>
        <p className="foot-stamp" aria-hidden="true">
          <Mark size={12} />
          Costbook · made for kitchens that keep a sheet
        </p>
      </div>

      <div className="foot-cols">
        <nav aria-label="Your book">
          <h4>Your book</h4>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/recipes">Recipes</Link>
          <Link href="/ingredients">Ingredients</Link>
          <Link href="/import">Import a sheet</Link>
          <Link href="/settings">Settings</Link>
        </nav>
        <div>
          <h4>Stuck on something?</h4>
          <p className="foot-help">
            <a href="mailto:hello@costbook.in">hello@costbook.in</a> reaches the
            people who build this, not a help desk. We usually reply within a
            day. If a sheet will not import, send it — a file we cannot read is
            a bug on our side.
          </p>
        </div>
        <nav aria-label="About Costbook">
          <h4>Costbook</h4>
          <Link href="/about">What this is</Link>
          <Link href="/plans">Plans</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>

      <div className="foot-bottom">
        <span className="figure">© 2026 Costbook · a recipe costing book</span>
        <span className="foot-legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </span>
      </div>
    </footer>
  );
}

import Link from 'next/link';

import { Wordmark } from './wordmark';

/**
 * The A10 entry shell, unchanged, reused by sign-up (A31), invitation (A32)
 * and password reset (A33).
 *
 * Same dark panel, same 404px card. Reusing it is the point: three different
 * arrivals into one product should not look like three different products.
 */
export function EntryShell({
  headline,
  copy,
  aside,
  children,
}: {
  headline: string;
  copy: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="entry">
      <section className="entry-brand" aria-label="What Costbook does">
        <div className="entry-brand-mark">
          <Wordmark mode="public" size={20} />
        </div>
        <div className="entry-pitch">
          <h2 className="entry-headline">{headline}</h2>
          <p className="entry-copy">{copy}</p>
          {aside}
        </div>
        <div className="entry-trust">
          <span>No card, ever, on the free tier</span>
          <span className="entry-trust-rule" aria-hidden="true" />
          <span>Your sheet is read, never altered</span>
        </div>
      </section>

      <section className="entry-side">
        {children}
        <nav className="entry-links" aria-label="Legal">
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms</Link>
          <a href="mailto:hello@costbook.in">Contact a human</a>
        </nav>
      </section>
    </main>
  );
}

/** The rule, stated once, in the two places a password is chosen. */
export const PASSWORD_RULE = '8 characters or more. Nothing else — no symbol you’ll forget by Tuesday.';
export const MIN_PASSWORD = 8;

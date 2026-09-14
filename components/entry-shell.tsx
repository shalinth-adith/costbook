import Link from 'next/link';

import { Wordmark } from './wordmark';

import { MIN_PASSWORD, PASSWORD_RULE } from '@/lib/password';

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
  headline: React.ReactNode;
  copy: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="gate">
      <section className="entry-brand" aria-label="What Costbook does">
        <div className="entry-brand-mark">
          <Wordmark mode="public" size={20} />
        </div>
        <div className="entry-pitch">
          <p className="entry-eyebrow">Recipe costing · one kitchen</p>
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
          <Link href="/contact">Contact a human</Link>
        </nav>
      </section>
    </main>
  );
}

/*
 * The rule, stated once — in lib/password.ts, because the server enforces it
 * too and a rule that lives in a component is a rule only the screen knows.
 * Re-exported here so every existing import keeps working.
 */
export { MIN_PASSWORD, PASSWORD_RULE };

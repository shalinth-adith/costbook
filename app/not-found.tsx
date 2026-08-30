import Link from 'next/link';

import { Wordmark } from '@/components/wordmark';

import './legal.css';

/**
 * A30 · 404. The first thing it states is that nothing was deleted, because
 * that is the only thing the reader cares about. No apology theatre, no
 * cartoon, no "oops" — a ledger does not make jokes about losing your numbers.
 */
export default function NotFound() {
  return (
    <div className="legal is-narrow">
      <header className="legal-top"><Wordmark mode="public" /></header>
      <main>
        <p className="legal-code figure">404</p>
        <h1>This page isn&rsquo;t on the shelf.</h1>
        <p>
          Either the link is old or a dish has been renamed since it was written. Nothing has been
          deleted because of this — try the recipe library, or search for the dish by name.
        </p>
        <div className="legal-actions">
          <Link href="/dashboard" className="btn btn-primary">Back to the dashboard</Link>
          <Link href="/recipes" className="btn">Search the recipes</Link>
        </div>
      </main>
    </div>
  );
}

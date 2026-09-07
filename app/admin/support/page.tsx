import type { Metadata } from 'next';
import Link from 'next/link';

import { accounts, requireAdmin, threads } from '@/lib/admin';

export const metadata: Metadata = { title: 'Support · Costbook' };
export const dynamic = 'force-dynamic';

/**
 * Who is waiting on a reply.
 *
 * The contact page still gives an address and no form — its own comment says
 * a form is a way of not giving somebody one, and that stands, especially for
 * a stranger who cannot sign in. This is the second door, for an operator who
 * is already inside, and it exists because a reply has to reach them: there
 * is no mail provider yet, so a thread in the product is read the next time
 * they open Costbook. The same reasoning as `flags`.
 *
 * Sorted by who has waited longest, which is the only fair order for a queue.
 */
export default async function AdminSupport() {
  await requireAdmin();
  const [rows, all] = await Promise.all([threads(), accounts()]);
  const nameOf = new Map(all.map((a) => [a.orgId, a.name]));
  const open = rows.filter((t) => t.status === 'open');

  const waited = (at: string) => {
    const h = Math.floor((Date.now() - new Date(at).getTime()) / 3_600_000);
    if (h < 1) return 'just now';
    if (h < 24) return `${String(h)}h`;
    return `${String(Math.floor(h / 24))}d`;
  };

  return (
    <div className="bo">
      <header className="bo-top">
        <div>
          <p className="bo-eyebrow">Back office</p>
          <h1 className="bo-h1">Support</h1>
        </div>
        <nav className="bo-nav" aria-label="Back office">
          <Link href="/admin">Metrics</Link>
          <Link href="/admin/accounts">Accounts</Link>
          <span aria-current="page">Support</span>
          <Link href="/admin/health">Health</Link>
          <Link href="/dashboard">Your own book</Link>
        </nav>
      </header>

      <section className="bo-block bo-wide">
        {rows.length === 0 ? (
          <>
            <p className="bo-quiet">Nobody is waiting.</p>
            <p className="bo-note">
              Threads appear here when an operator writes from inside Costbook.
              The address on the contact page still reaches you by email and is
              the only door for somebody who cannot sign in — that is on
              purpose, and it does not show up here.
            </p>
          </>
        ) : (
          <>
            <p className="bo-lede">
              <b className="figure">{open.length}</b>{' '}
              {open.length === 1 ? 'thread is' : 'threads are'} waiting, longest
              first.
            </p>
            <ul className="bo-threads">
              {rows.map((t) => (
                <li key={t.id} className={`bo-thread is-${t.status}`}>
                  <span className="bo-thread-who">{nameOf.get(t.orgId) ?? 'A kitchen'}</span>
                  <span className="bo-thread-subject">{t.subject}</span>
                  <span className="figure bo-thread-waited">{waited(t.lastAt)}</span>
                  <span className={`bo-thread-state is-${t.status}`}>{t.status}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

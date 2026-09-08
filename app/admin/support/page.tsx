import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminEmpty } from '@/components/admin-empty';
import { AdminHead } from '@/components/admin-head';
import { AdminThread } from '@/components/admin-thread';
import { accounts, threadsWithMessages } from '@/lib/admin';

import { closeThread, replyToThread } from './[id]/actions';

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
  const [rows, all] = await Promise.all([threadsWithMessages(), accounts()]);
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
      <AdminHead
        section="Support"
        title="Support"
        lede="Who is waiting on a reply, longest first. A reply lands on their Help page, and its copy waits in Mail."
        aside={
          open.length > 0 ? (
            <span className="ba-count is-waiting">
              <b className="figure">{open.length}</b> waiting
            </span>
          ) : null
        }
      />

      <section className="bo-block bo-wide">
        {rows.length === 0 ? (
          <AdminEmpty
            title="Nobody is waiting"
            said="The address on the contact page still reaches you by email, and is the only door for somebody who cannot sign in — on purpose. Mail does not show up here."
            would="an operator writes from the Help page inside Costbook."
          />
        ) : (
          <>
            <p className="bo-lede">
              <b className="figure">{open.length}</b>{' '}
              {open.length === 1 ? 'thread is' : 'threads are'} waiting, longest
              first.
            </p>
            <ul className="bo-threads">
              {rows.map((t) => (
                <li key={t.id} className={`bo-thread-item is-${t.status}`}>
                  <div className="bo-thread">
                    <span className="bo-thread-who">{nameOf.get(t.orgId) ?? 'A kitchen'}</span>
                    <span className="bo-thread-subject">{t.subject}</span>
                    <span className="figure bo-thread-waited">{waited(t.lastAt)}</span>
                    <span className={`bo-thread-state is-${t.status}`}>{t.status}</span>
                  </div>
                  <AdminThread
                    id={t.id}
                    messages={t.messages}
                    onReply={replyToThread}
                    onClose={closeThread}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

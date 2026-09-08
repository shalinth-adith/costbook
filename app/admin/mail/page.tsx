import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminHead } from '@/components/admin-head';
import { MailView } from '@/components/mail-view';
import { mailConfigured, outbox } from '@/lib/mail';

import { postQueued } from './actions';

export const metadata: Metadata = { title: 'Mail · Costbook' };
export const dynamic = 'force-dynamic';

/**
 * What has been written, and what has actually gone out.
 *
 * Two dates on every row, deliberately: written and posted. Costbook has no
 * mail provider yet, so every reply is delivered inside the product and its
 * copy waits here. The screen says which of those is true rather than showing
 * a tick that means neither.
 */
export default async function AdminMail() {
  const letters = await outbox(80);

  return (
    <div className="bo">
      <AdminHead
        section="Mail"
        title="Mail"
        lede="What has been written, and what has actually gone out. Two dates on every row, on purpose."
        aside={
          <span className={`ba-count${letters.some((l) => l.sentAt === null) ? ' is-waiting' : ''}`}>
            <b className="figure">{letters.filter((l) => l.sentAt === null).length}</b> waiting
          </span>
        }
      />

      <section className="bo-block bo-wide">
        <MailView letters={letters} configured={mailConfigured()} onPost={postQueued} />
      </section>
    </div>
  );
}

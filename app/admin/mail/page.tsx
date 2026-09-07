import type { Metadata } from 'next';
import Link from 'next/link';

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
      <header className="ba-head">
        <h1 className="ba-h1">Mail</h1>
      </header>

      <section className="bo-block bo-wide">
        <MailView letters={letters} configured={mailConfigured()} onPost={postQueued} />
      </section>
    </div>
  );
}

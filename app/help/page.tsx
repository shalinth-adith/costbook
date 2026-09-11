import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { HelpView, type HelpThread } from '@/components/help-view';
import { book } from '@/lib/book';
import { requireSetup } from '@/lib/guard';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

import { askForHelp, replyFromKitchen } from './actions';

export const metadata: Metadata = { title: 'Help · Costbook' };
export const dynamic = 'force-dynamic';

/**
 * Where an operator asks, and reads the answer.
 *
 * RLS does the scoping: `support_threads` is readable by the org it belongs
 * to, so this query needs no `eq('org_id', …)` and could not return another
 * kitchen's thread if it tried.
 */
export default async function HelpPage() {
  await requireSetup();
  const b = await book();

  let threads: readonly HelpThread[] = [];
  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    const res = await supabase
      .from('support_threads')
      .select('id, subject, status, opened_at, support_messages(id, from_admin, body, at)')
      .order('last_at', { ascending: false });
    if (res.error === null) {
      threads = ((res.data ?? []) as {
        id: string;
        subject: string;
        status: HelpThread['status'];
        opened_at: string;
        support_messages: { id: string; from_admin: boolean; body: string; at: string }[] | null;
      }[]).map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        openedAt: t.opened_at,
        messages: [...(t.support_messages ?? [])]
          .sort((x, y) => x.at.localeCompare(y.at))
          .map((m) => ({ id: m.id, fromAdmin: m.from_admin, body: m.body, at: m.at })),
      }));
    } else {
      console.warn('Could not read your threads:', res.error.message);
    }
  }

  return (
    <AppShell
      orgName={b.org.name}
      current="Settings"
      currencyCode={b.org.currency}
      currencySettable={b.recipes.length === 0}
      dishCount={b.recipes.length}
      plan={b.plan}
    >
      <div className="set">
        <div className="set-head">
          <div>
            <h1 className="set-h">Help</h1>
            <p className="set-lede">
              Ask us anything about your book. The reply appears here.
            </p>
          </div>
        </div>
        <HelpView threads={threads} onAsk={askForHelp} onReply={replyFromKitchen} />
      </div>
    </AppShell>
  );
}

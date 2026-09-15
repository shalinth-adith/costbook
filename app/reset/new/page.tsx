import type { Metadata } from 'next';
import Link from 'next/link';

import { EntryShell } from '@/components/entry-shell';
import { NewPasswordForm } from '@/components/new-password-form';
import { sessionProvedByCode } from '@/lib/proved';
import { ASK_FOR_CODE, CODE_SPENT } from '@/lib/recover';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

import '../../sign-in/entry.css';

export const metadata: Metadata = {
  title: 'Choose a new password · Costbook',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The far side of a recovery code.
 *
 * Asked on the server before anything renders, and the answer has three
 * shapes. No session: the code was used already, or the hour ran out, or
 * somebody typed this address in hopefully — say so now rather than after a
 * password has been chosen and typed. A session, but one earned with a
 * password rather than a code: nothing is wrong, but an open laptop is not
 * proof of an address, so ask for a code (lib/proved.ts). A session that
 * typed a code this hour: the form.
 */
export default async function NewPasswordPage() {
  const state = await (async (): Promise<'spent' | 'ask' | 'proved'> => {
    if (!supabaseConfigured()) return 'spent';
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    if (data.user === null) return 'spent';
    return (await sessionProvedByCode(supabase)) ? 'proved' : 'ask';
  })();

  return (
    <EntryShell
      headline="Back to your menu."
      copy="Your dishes, your rates and everything you have costed are exactly where you left them. This is only about the password."
    >
      {state === 'proved' ? (
        <NewPasswordForm />
      ) : state === 'ask' ? (
        <div className="entry-card">
          <h1 className="entry-title">Ask for a code first.</h1>
          <p className="entry-sub">{ASK_FOR_CODE}</p>
          <Link className="btn btn-primary entry-action" href="/reset">
            Send me a code
          </Link>
        </div>
      ) : (
        <div className="entry-card">
          <h1 className="entry-title">That code has been spent.</h1>
          <p className="entry-sub">{CODE_SPENT}</p>
          <Link className="btn btn-primary entry-action" href="/reset">
            Send me another
          </Link>
        </div>
      )}
    </EntryShell>
  );
}

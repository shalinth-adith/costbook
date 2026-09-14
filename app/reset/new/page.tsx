import type { Metadata } from 'next';
import Link from 'next/link';

import { EntryShell } from '@/components/entry-shell';
import { NewPasswordForm } from '@/components/new-password-form';
import { LINK_FAILED } from '@/lib/recover';
import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';

import '../../sign-in/entry.css';

export const metadata: Metadata = {
  title: 'Choose a new password · Costbook',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The far side of a recovery link.
 *
 * Asked on the server before anything renders: a session means the link was
 * followed and is still good. Without one — the hour ran out, the link was
 * used already, or somebody typed this address in hopefully — the screen says
 * so immediately rather than after a password has been chosen and typed.
 */
export default async function NewPasswordPage() {
  const signedIn = await (async () => {
    if (!supabaseConfigured()) return false;
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    return data.user !== null;
  })();

  return (
    <EntryShell
      headline="Back to your menu."
      copy="Your dishes, your rates and everything you have costed are exactly where you left them. This is only about the password."
    >
      {signedIn ? (
        <NewPasswordForm />
      ) : (
        <div className="entry-card">
          <h1 className="entry-title">That link has been spent.</h1>
          <p className="entry-sub">{LINK_FAILED}</p>
          <Link className="btn btn-primary entry-action" href="/reset">
            Send me another
          </Link>
        </div>
      )}
    </EntryShell>
  );
}

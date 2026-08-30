import { NextResponse } from 'next/server';

import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';
import { org, setOrg } from '@/lib/store';

/**
 * Development sign-in bypass.
 *
 * Exists so automated checks and a quick look at the app do not have to walk
 * the wizard on every server restart. It is not a back door: the whole handler
 * refuses outside development, so there is nothing to disable in production
 * because there is nothing there.
 *
 * It does two things, and the second is temporary.
 *
 * 1. Signs in the standard test account against Supabase, creating it on first
 *    use, and sets a real session cookie. That is the mechanism that will
 *    matter once the screens read from Postgres — it is real auth, not a
 *    pretend one, so nothing has to be rewritten when the store goes.
 *
 * 2. Marks the in-memory org past setup, because the screens still read that
 *    store and the setup guard would otherwise bounce every request back to
 *    the wizard. This half disappears with `lib/store.ts`.
 *
 * It seeds no dishes and no ingredients. The book stays empty, because an
 * account's contents are whatever its operator entered and a convenience for
 * looking at screens is not a licence to invent a menu.
 */

const DEV_EMAIL = 'admin@thebrewapps.com';
const DEV_PASSWORD = 'thebrewapps';

/**
 * Obviously fake, and greppable. A dev session must never be mistakable for a
 * real one at a glance, so the name says what it is wherever it renders.
 */
const DEV_ORG_NAME = 'PLACEHOLDER_Dev Kitchen';

function forbiddenInProduction(): NextResponse | null {
  if (process.env.NODE_ENV === 'production') {
    // 404 rather than 403: in production this route does not exist, and saying
    // "forbidden" would confirm that it does.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}

export async function POST(): Promise<NextResponse> {
  const refused = forbiddenInProduction();
  if (refused !== null) return refused;

  let session: 'created' | 'signed-in' | 'skipped' = 'skipped';

  if (supabaseConfigured()) {
    const supabase = await supabaseServer();

    const signIn = await supabase.auth.signInWithPassword({
      email: DEV_EMAIL,
      password: DEV_PASSWORD,
    });

    if (signIn.error !== null) {
      // First run: the account does not exist yet. Creating it fires the
      // signup trigger, so it arrives with an org, an outlet and a membership
      // exactly like a real one.
      const signUp = await supabase.auth.signUp({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      });
      if (signUp.error !== null) {
        return NextResponse.json(
          { error: 'dev-login could not establish a session', detail: signUp.error.message },
          { status: 500 },
        );
      }
      session = 'created';
    } else {
      session = 'signed-in';
    }
  }

  // The half that goes when the store does.
  setOrg({
    name: DEV_ORG_NAME,
    taxTreatment: 'absorbed',
    foodCostTarget: 30,
    setupDone: true,
  });

  return NextResponse.json({
    ok: true,
    email: DEV_EMAIL,
    session,
    org: org().name,
    note: 'No dishes or ingredients were created. The book is empty.',
  });
}

/** Put it back. Signs out and returns the account to its unset state. */
export async function DELETE(): Promise<NextResponse> {
  const refused = forbiddenInProduction();
  if (refused !== null) return refused;

  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }

  setOrg({ name: '', taxTreatment: null, setupDone: false });
  return NextResponse.json({ ok: true, note: 'Signed out; setup is unfinished again.' });
}

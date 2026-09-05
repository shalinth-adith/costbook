import { NextResponse } from 'next/server';

import { supabaseConfigured } from '@/lib/supabase/env';
import { supabaseServer } from '@/lib/supabase/server';
import { book, saveOrg } from '@/lib/book';

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

/*
 * A local address on a reserved domain. `.test` is reserved by RFC 2606 and can
 * never be registered, so this cannot collide with a real inbox or accidentally
 * mail a stranger if confirmations are ever turned on.
 *
 * Costbook's own, deliberately. It is this project's development account and it
 * lives in this project's database.
 */
const DEV_EMAIL = 'dev@costbook.test';
const DEV_PASSWORD = 'costbook-dev';

/**
 * Obviously a development account, without putting a code label on screen.
 *
 * It was PLACEHOLDER_Dev Kitchen, which is greppable and unmistakable — and
 * rendered in the header of every screen. A prefix meant for a grep does not
 * belong in the interface. The constant's own name and this file's
 * environment gate carry that job instead.
 */
const DEV_ORG_NAME = 'Dev Kitchen';

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
      /*
       * Only when there is nobody to sign in as.
       *
       * Any failure used to fall through to signUp — a wrong password, a rate
       * limit, a provider hiccup — and with enumeration protection on, signUp
       * returns no session at all. The next line then wrote to an org nobody
       * was signed in to and the route answered 500 with no idea why. A
       * signed-out visitor and a rate-limited one are different problems and
       * only the first has this answer.
       */
      const noSuchAccount = /invalid login credentials/i.test(signIn.error.message);
      if (!noSuchAccount) {
        return NextResponse.json(
          { error: 'dev-login could not sign in', detail: signIn.error.message },
          { status: 502 },
        );
      }
      // First run: the account does not exist yet. Creating it fires the
      // signup trigger, so it arrives with an org, an outlet and a membership
      // exactly like a real one.
      const signUp = await supabase.auth.signUp({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      });
      if (signUp.error !== null || signUp.data.session === null) {
        return NextResponse.json(
          {
            error: 'dev-login could not establish a session',
            detail: signUp.error?.message ?? 'The project returned no session; email confirmation may be on.',
          },
          { status: 500 },
        );
      }
      session = 'created';
    } else {
      session = 'signed-in';
    }
  }

  /*
   * Marks the org past setup so the guard does not bounce every request back
   * to the wizard — and nothing else, on an account that already exists.
   *
   * This wrote the name, the tax treatment and the target on every call, so
   * signing in as the dev user quietly undid whatever those had been set to
   * while testing the very screens that set them. A first run has no name yet
   * and gets one.
   */
  const { org } = await book();
  await saveOrg({
    ...(org.name.trim() === '' ? { name: DEV_ORG_NAME, taxTreatment: 'absorbed' as const } : {}),
    setupDone: true,
  });

  return NextResponse.json({
    ok: true,
    email: DEV_EMAIL,
    session,
    org: (await book()).org.name,
    note: 'No dishes or ingredients were created. The book is empty.',
  });
}

/** Put it back. Signs out and returns the account to its unset state. */
export async function DELETE(): Promise<NextResponse> {
  const refused = forbiddenInProduction();
  if (refused !== null) return refused;

  await saveOrg({ name: '', taxTreatment: null, setupDone: false });

  if (supabaseConfigured()) {
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
  }
  return NextResponse.json({ ok: true, note: 'Signed out; setup is unfinished again.' });
}

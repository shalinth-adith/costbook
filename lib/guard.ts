import { redirect } from 'next/navigation';

import { book } from './book';

/**
 * Send an account that has not finished setup to the wizard.
 *
 * A brand new book has no name, no currency answer, no tax answer and no
 * target. Landing on a dashboard reading "0 dishes · average food cost —"
 * teaches nothing and offers nothing; the four questions do both.
 *
 * It also keeps the header honest. The organisation is created with an empty
 * name rather than a guessed one, so the only way that blank is never seen is
 * to not show the app until step 1 is answered.
 */
export async function requireSetup(): Promise<void> {
  const { org } = await book();
  if (!org.setupDone) redirect('/setup');
}

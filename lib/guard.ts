import { redirect } from 'next/navigation';

import { org } from './store';

/**
 * Send an account that has not finished setup to the wizard.
 *
 * A brand new book has no name, no currency answer, no tax answer and no
 * target. Landing on a dashboard reading "0 dishes · average food cost —"
 * teaches nothing and offers nothing; the four questions do both, and they
 * take about a minute (A22).
 *
 * This is also what keeps the header honest. The organisation is created with
 * an empty name rather than a guessed one — Costbook does not invent a figure
 * the operator did not give, and a name is no different — so the only way that
 * blank is never seen is to not show the app until step 1 is answered.
 *
 * Called by every screen inside the app. Not by /setup itself, for obvious
 * reasons, and not by the public pages.
 */
export function requireSetup(): void {
  if (!org().setupDone) redirect('/setup');
}

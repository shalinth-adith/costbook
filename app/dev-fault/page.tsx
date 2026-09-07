import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * A fault on purpose, so the reporter can be proved rather than assumed.
 *
 * The error boundary has always claimed the fault was reported automatically,
 * and until `lib/report.ts` existed that claim was false. A claim like that
 * has to be checkable, and the only way to check a crash reporter is to
 * crash: this page throws during render, React shows `app/error.tsx`, and the
 * boundary writes a row to `app_errors` that the back office reads.
 *
 * Gated the way `dev-login` is, and for the same reason: the whole handler
 * refuses outside development, so there is nothing to disable in production
 * because there is nothing there. It answers 404 rather than 403 — saying
 * "forbidden" would confirm the route exists.
 */
export default function DevFault() {
  if (process.env.NODE_ENV === 'production') notFound();

  throw new Error(
    'Deliberate fault from /dev-fault — proving the reporter writes to app_errors.',
  );
}

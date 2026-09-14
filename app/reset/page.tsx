import type { Metadata } from 'next';

import { EntryShell } from '@/components/entry-shell';
import { ResetRequestForm } from '@/components/reset-request-form';

import '../sign-in/entry.css';

export const metadata: Metadata = {
  title: 'Forgotten password · Costbook',
  // A page reached by somebody locked out has no business in a search result.
  robots: { index: false, follow: false },
};

/** A33, built at last: there is a domain and a mail provider behind it now. */
export default function ResetPage() {
  return (
    <EntryShell
      headline="Back to your menu."
      copy="Your dishes, your rates and everything you have costed are exactly where you left them. This is only about the password."
    >
      <ResetRequestForm />
    </EntryShell>
  );
}

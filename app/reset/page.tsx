import type { Metadata } from 'next';

import { EntryShell } from '@/components/entry-shell';
import { ResetForm } from '@/components/reset-form';

import '../sign-in/entry.css';

export const metadata: Metadata = { title: 'Set a new password · Costbook' };

/** A33. */
export default function Reset() {
  return (
    <EntryShell
      headline="Back to your menu."
      copy="Setting a new password signs you in as well — being returned to a sign-in screen to type the password you just chose is the most common small cruelty in this flow."
    >
      <ResetForm />
    </EntryShell>
  );
}

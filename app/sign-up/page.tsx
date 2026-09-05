import type { Metadata } from 'next';

import { EntryShell } from '@/components/entry-shell';
import { SignUpForm } from '@/components/sign-up-form';

import '../sign-in/entry.css';

export const metadata: Metadata = { title: 'Create an account · Costbook' };

/**
 * A31. The wizard is announced before the button is pressed — someone who
 * knows a short setup is coming finishes it; someone ambushed by a wizard
 * closes the tab.
 */
export default function SignUp() {
  return (
    <EntryShell
      headline="Keep your spreadsheet. We'll make it answer questions."
      copy="Two things now, a short setup after, and then you can bring your sheet in. Nothing is retyped and your file is only ever read."
      aside={
        <ol className="entry-steps">
          <li><span className="figure">01</span> This form — an email and a password.</li>
          <li><span className="figure">02</span> Your restaurant, and the rules you price by. About a minute.</li>
          <li><span className="figure">03</span> Your spreadsheet, if you have one.</li>
        </ol>
      }
    >
      <SignUpForm />
    </EntryShell>
  );
}

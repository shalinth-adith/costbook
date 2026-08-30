import type { Metadata } from 'next';

import { EntryShell } from '@/components/entry-shell';
import { type InviteState, JoinForm } from '@/components/join-form';

import { org } from '@/lib/store';

import '../sign-in/entry.css';

export const metadata: Metadata = { title: 'Join · Costbook' };

const STATES: readonly InviteState[] = ['valid', 'has_account', 'expired', 'accepted'];

/**
 * A32. The invited manager does not go through the wizard — the café already
 * has a currency, a tax treatment and a target.
 */
export default async function Join({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const asked = typeof params['state'] === 'string' ? params['state'] : 'valid';
  const state: InviteState = STATES.includes(asked as InviteState) ? (asked as InviteState) : 'valid';

  const name = org().name;

  return (
    <EntryShell
      headline={`${name} already keeps its menu here.`}
      copy="You're being added to the book that already exists — nothing to set up."
      aside={
        <ul className="entry-steps is-plain">
          <li>Add and cost recipes, print prep cards</li>
          <li>Keep ingredient rates up to date</li>
          <li>Billing, the team and how prices are worked out stay with the owner</li>
          <li>Your own sign-in — no shared password</li>
        </ul>
      }
    >
      <JoinForm state={state} org={name} invitedBy="Karthik" email="suresh@srikrishnacafe.in" />
    </EntryShell>
  );
}

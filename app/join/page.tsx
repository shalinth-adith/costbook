import type { Metadata } from 'next';

import { EntryShell } from '@/components/entry-shell';
import { type InviteState, JoinForm } from '@/components/join-form';

import '../sign-in/entry.css';

export const metadata: Metadata = { title: 'Join · Costbook' };

const STATES: readonly InviteState[] = ['valid', 'has_account', 'expired', 'accepted'];

/**
 * A32. The invited manager does not go through the wizard — the café already
 * has a currency, a tax treatment and a target.
 *
 * An invitation is a token in the link. Until the app reads the `invitations`
 * table (the schema is there; the query is not), arriving here without one is
 * the lapsed state — which is honest, and is one of the four states the design
 * already specifies. It is not an occasion to invent a café and a colleague.
 *
 * `?state=` renders the other three for review, and only in development.
 */
export default async function Join({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params['token'] === 'string' ? params['token'] : null;

  const asked = typeof params['state'] === 'string' ? params['state'] : null;
  const preview =
    process.env.NODE_ENV !== 'production' && asked !== null && STATES.includes(asked as InviteState)
      ? (asked as InviteState)
      : null;

  const state: InviteState = preview ?? 'expired';

  // Named only when an invitation actually carries them. Nothing is filled in.
  const known = preview !== null && preview !== 'expired';

  return (
    <EntryShell
      headline={known ? 'This café already keeps its menu here.' : 'That invitation link is not valid.'}
      copy={
        known
          ? "You're being added to the book that already exists — nothing to set up."
          : 'An invitation link carries a token that says which café it is for. This one does not, or it has been used already.'
      }
      aside={
        known ? (
          <ul className="entry-steps is-plain">
            <li>Add and cost recipes, print prep cards</li>
            <li>Keep ingredient rates up to date</li>
            <li>Billing, the team and how prices are worked out stay with the owner</li>
            <li>Your own sign-in — no shared password</li>
          </ul>
        ) : undefined
      }
    >
      <JoinForm
        state={state}
        org={known ? 'the café' : ''}
        invitedBy={known ? 'The owner' : ''}
        email=""
        token={token}
      />
    </EntryShell>
  );
}

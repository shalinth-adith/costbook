'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { MIN_PASSWORD, PASSWORD_RULE } from './entry-shell';

export type InviteState = 'valid' | 'has_account' | 'expired' | 'accepted';

/**
 * Join by invitation (A32).
 *
 * A different screen from sign-up, and it does not lead to the wizard. The café
 * already has a currency, a tax treatment and a target — running a manager
 * through setup would ask them to configure a business that exists, or throw
 * their answers away.
 */
export function JoinForm({
  state,
  org,
  invitedBy,
  email,
  token,
}: {
  state: InviteState;
  org: string;
  invitedBy: string;
  email: string;
  /** Null when the link carried no invitation. Nothing is guessed from that. */
  token: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD;

  if (state === 'expired') {
    return (
      <div className="entry-card">
        <h1 className="entry-title">
          {token === null ? 'This link is missing its invitation' : 'This invitation has lapsed'}
        </h1>
        <p className="entry-sub">
          {token === null
            ? 'An invitation link carries a token naming the café it is for. This one arrived without it.'
            : 'Invitations last 14 days, and this one has passed that.'}
        </p>
        <div className="notice notice-near">
          <p className="notice-title">Nothing is wrong with your address.</p>
          <p className="notice-text">
            Nothing has been refused — the link is simply not one we can act on. Ask whoever invited
            you to send a fresh one; it takes them a moment.
          </p>
        </div>
        <Link href="/sign-in" className="btn entry-action">Back to sign in</Link>
      </div>
    );
  }

  if (state === 'accepted') {
    return (
      <div className="entry-card">
        <h1 className="entry-title">You&rsquo;re already in.</h1>
        <p className="entry-sub">
          This invitation was accepted on 22 August, so there&rsquo;s nothing left to do here. Sign
          in and {org} will be waiting.
        </p>
        <Link href="/sign-in" className="btn btn-primary entry-action">Sign in</Link>
        <p className="entry-foot">
          Forgotten the password you chose? <Link href="/contact" className="link link-sm">Write to us</Link>.
        </p>
      </div>
    );
  }

  if (state === 'has_account') {
    return (
      <div className="entry-card">
        <h1 className="entry-title">Invitation</h1>
        <p className="entry-sub">
          {invitedBy} has asked you to join {org} on Costbook.
        </p>
        <div className="notice notice-flat">
          <p className="notice-title">You already sign in with this address.</p>
          <p className="notice-text">
            Use the account you have — no second password to remember, and both places sit under the
            one sign-in. You&rsquo;ll be able to switch between them from the top of the screen.
          </p>
        </div>
        <button type="button" className="btn btn-primary entry-action" onClick={() => router.push('/dashboard')}>
          Join with this account
        </button>
        <p className="entry-foot">
          Nothing about your existing places changes, and no second account is created.
        </p>
      </div>
    );
  }

  return (
    <div className="entry-card">
      <h1 className="entry-title">Invitation</h1>
      <p className="entry-sub">
        {invitedBy} has asked you to join {org} on Costbook. You&rsquo;ll be able to add and cost
        recipes, and keep ingredient rates up to date. Billing and team settings stay with the owner.
      </p>

      <label className="field">
        <span className="field-label-row"><span className="field-label">Your name</span></span>
        <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
        <span className="field-label">So {invitedBy} can see who changed a rate.</span>
      </label>

      <label className="field">
        <span className="field-label-row"><span className="field-label">Email</span></span>
        <input className="field-input" value={email} readOnly aria-readonly="true" />
        {/* Fixed, and the reason is at full contrast — a disabled control may
            lose contrast; the sentence explaining why may not (A1). */}
        <span className="field-label">
          The invitation was sent to this address, so it&rsquo;s fixed. {invitedBy} can send a new
          one to a different address.
        </span>
      </label>

      <label className="field">
        <span className="field-label-row">
          <span className="field-label">Choose a password</span>
          <button type="button" className="field-toggle" onClick={() => setShow((v) => !v)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
        <input
          className="field-input"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <span className="field-label">{longEnough ? '✓ Long enough' : PASSWORD_RULE}</span>
      </label>

      <button
        type="button"
        className="btn btn-primary entry-action"
        disabled={!longEnough}
        onClick={() => router.push('/dashboard')}
      >
        Join {org}
      </button>
      <p className="entry-foot">
        You&rsquo;ll land straight on the menu. There&rsquo;s nothing to set up — the café&rsquo;s
        costing is already configured.
      </p>

      <div className="entry-divider"><span className="entry-divider-label">or</span></div>
      <button type="button" className="btn entry-action">Email me a sign-in link instead</button>
    </div>
  );
}

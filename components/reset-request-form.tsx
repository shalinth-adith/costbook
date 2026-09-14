'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { type ResetState, requestReset } from '@/app/reset/actions';
import { RESET_SENT } from '@/lib/recover';

const IDLE: ResetState = { kind: 'idle' };

/**
 * "I cannot get in."
 *
 * One field and one answer. The answer is the same sentence for every
 * address, which is stated on the screen itself rather than only in the code
 * — somebody who has just been told "if that address has an account" is
 * entitled to know that the vagueness is on purpose and not a system that
 * failed to look.
 */
export function ResetRequestForm() {
  const [state, act, pending] = useActionState(requestReset, IDLE);

  if (state.kind === 'sent') {
    return (
      <div className="entry-card">
        <h1 className="entry-title">Check your mail.</h1>
        <p className="entry-sub">{RESET_SENT}</p>
        <p className="entry-foot">
          Worded the same whether the address has an account or not, so this screen cannot be
          used to find out who does.
        </p>
        <Link className="btn entry-action" href="/sign-in">
          Back to sign in
        </Link>
      </div>
    );
  }

  const fault = state.kind === 'fields' ? state.message : null;

  return (
    <form className="entry-card" action={act}>
      <h1 className="entry-title">Forgotten your password?</h1>
      <p className="entry-sub">
        Give the address you signed up with and we will post a link that lets you choose a new
        one. Asking does not change anything until you follow it.
      </p>

      <div className="field">
        <div className="field-label-row">
          <label className="field-label" htmlFor="email">
            Email
          </label>
        </div>
        <div className={`field-control${fault ? ' is-wrong' : ''}${pending ? ' is-locked' : ''}`}>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className="field-input"
            data-testid="email-input"
            disabled={pending}
            aria-invalid={fault !== null}
            aria-describedby={fault ? 'email-fault' : undefined}
            required
          />
        </div>
        {fault !== null && (
          <span id="email-fault" className="fault">
            {fault}
          </span>
        )}
      </div>

      <button type="submit" className="btn btn-primary entry-action" disabled={pending}>
        {pending ? 'Sending…' : 'Send me a link'}
      </button>

      <p className="entry-foot">
        Remembered it? <Link className="link" href="/sign-in">Sign in</Link>. Stuck for another
        reason? <Link className="link" href="/contact">Write to a person</Link>.
      </p>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { unstable_rethrow } from 'next/navigation';

import { type ChooseState, chooseNewPassword } from '@/app/reset/actions';
import { LINK_FAILED } from '@/lib/recover';

import { PASSWORD_RULE } from './entry-shell';

const IDLE: ChooseState = { kind: 'idle' };

/**
 * Choose a new password, having proved the address.
 *
 * The link created a session before this screen rendered, so there is nothing
 * to type but the password itself — no address, no code pasted from an email.
 * A form that asked for the address again would be asking the person to
 * re-prove something they have just proved, and would be a form that could
 * change somebody else's password if it trusted what was typed.
 */
export function NewPasswordForm() {
  const [state, act, pending] = useActionState(
    async (previous: ChooseState, form: FormData) => {
      try {
        return await chooseNewPassword(previous, form);
      } catch (error) {
        // A successful change redirects, and a redirect is thrown. Rethrowing
        // it here lets Next do its job rather than catching our own success.
        unstable_rethrow(error);
        throw error;
      }
    },
    IDLE,
  );
  const [shown, setShown] = useState(false);

  if (state.kind === 'expired') {
    return (
      <div className="entry-card">
        <h1 className="entry-title">That link has been spent.</h1>
        <p className="entry-sub">{LINK_FAILED}</p>
        <Link className="btn btn-primary entry-action" href="/reset">
          Send me another
        </Link>
      </div>
    );
  }

  const fault =
    state.kind === 'fields' ? state.message : state.kind === 'failed' ? state.message : null;

  return (
    <form className="entry-card" action={act}>
      <h1 className="entry-title">Choose a new password.</h1>
      <p className="entry-sub">
        This signs you in as well — being handed back to a sign-in screen to type the password
        you chose four seconds ago is the small cruelty this flow is famous for.
      </p>

      <div className="field">
        <div className="field-label-row">
          <label className="field-label" htmlFor="password">
            New password
          </label>
        </div>
        <div className={`field-control${fault ? ' is-wrong' : ''}${pending ? ' is-locked' : ''}`}>
          <input
            id="password"
            name="password"
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            className={`field-input${shown ? '' : ' is-masked'}`}
            data-testid="password-input"
            disabled={pending}
            aria-invalid={fault !== null}
            aria-describedby={fault ? 'password-fault' : 'password-rule'}
            required
          />
          <button
            type="button"
            className="field-toggle"
            aria-pressed={shown}
            disabled={pending}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        </div>
        {fault === null ? (
          <span id="password-rule" className="field-note">
            {PASSWORD_RULE}
          </span>
        ) : (
          <span id="password-fault" className="fault">
            {fault}
          </span>
        )}
      </div>

      <button type="submit" className="btn btn-primary entry-action" disabled={pending}>
        {pending ? 'Saving…' : 'Save it and take me in'}
      </button>
    </form>
  );
}

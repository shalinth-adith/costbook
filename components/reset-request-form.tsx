'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';

import { unstable_rethrow } from 'next/navigation';

import { type ResetState, confirmReset, requestReset } from '@/app/reset/actions';
import { CODE_LENGTH, codeFault as faultOf, digitsOf } from '@/lib/verify';
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
  const [code, setCode] = useState('');
  const [codeWrong, setCodeWrong] = useState<string | null>(null);
  const [checking, start] = useTransition();

  /*
   * The address the code was sent to.
   *
   * Held from the request rather than asked for again: the person has already
   * typed it, and asking twice on the screen after "we have sent you a code"
   * reads as the product having lost it.
   */
  const asked = state.kind === 'sent' ? state.email : '';

  const send = () => {
    const wrong = faultOf(code);
    if (wrong !== null) { setCodeWrong(wrong); return; }
    setCodeWrong(null);
    start(async () => {
      try {
        // A correct code redirects on the server to where the password is set.
        const out = await confirmReset(asked, code);
        setCodeWrong(out.message);
      } catch (error) {
        unstable_rethrow(error);
        setCodeWrong('That did not go through. Try again in a moment.');
      }
    });
  };

  if (state.kind === 'sent') {
    return (
      <form
        className="entry-card"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <h1 className="entry-title">Type the code.</h1>
        <p className="entry-sub">{RESET_SENT}</p>

        <div className="field">
          <div className="field-label-row">
            <label className="field-label" htmlFor="code">
              The code from the email
            </label>
          </div>
          <div className={`field-control${codeWrong !== null ? ' is-wrong' : ''}${checking ? ' is-locked' : ''}`}>
            <input
              id="code"
              name="code"
              className="field-input code-input figure"
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              maxLength={12}
              autoFocus
              disabled={checking}
              value={code}
              aria-invalid={codeWrong !== null}
              aria-describedby={codeWrong ? 'code-fault' : undefined}
              onChange={(e) => {
                setCode(digitsOf(e.target.value));
                setCodeWrong(null);
              }}
            />
          </div>
          {codeWrong !== null && (
            <span id="code-fault" className="fault">
              {codeWrong}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary entry-action"
          disabled={checking || digitsOf(code).length < CODE_LENGTH}
        >
          {checking ? 'Checking…' : 'Next'}
        </button>

        <p className="entry-foot">
          Check the spam folder.{' '}
          <Link className="link link-sm" href="/sign-in">
            Back to sign in
          </Link>
        </p>
      </form>
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

'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';

import { attemptSignIn, resendVerification } from '@/app/sign-in/actions';
import { type FieldName, IDLE, type SignInState, emailFault } from '@/lib/auth';
import { FREE_LIMITS } from '@/lib/org';

import { StatusGlyph } from './status-chip';

/**
 * A10 of the design canvas: sign in, and every way it goes wrong.
 *
 * The screen decides nothing. `lib/auth.ts` decides which state this is in and
 * the server action establishes the facts; everything here is rendering, plus
 * the two things only a browser knows — that the request never came back
 * (A10 · 07), and that it is still in flight (A10 · 08).
 */

/**
 * The action, wrapped so a dropped connection reads as one.
 *
 * A successful sign-in redirects, which resolves without a value while the
 * router is already navigating — hold the previous state rather than blanking
 * the form under someone's hands on the way out.
 */
async function run(previous: SignInState, form: FormData): Promise<SignInState> {
  try {
    const result = (await attemptSignIn(previous, form)) as SignInState | undefined;
    return result ?? previous;
  } catch {
    return { kind: 'unreachable' };
  }
}

/**
 * Clay for a refusal, ochre for a near miss. Both carry a shape as well as a
 * colour, and both sit against the field that caused them — never a banner.
 */
function Fault({ tone, children }: { tone: 'over' | 'near'; children: React.ReactNode }) {
  return (
    <span className={`field-fault field-fault-${tone}`}>
      <StatusGlyph status={tone} size={11} />
      <span>{children}</span>
    </span>
  );
}

function faultFor(state: SignInState, field: FieldName): string | null {
  if (state.kind !== 'fields') return null;
  return state.faults.find((f) => f.field === field)?.message ?? null;
}

/** mm:ss, in the duplexed mono, so the seconds do not jog the line as they tick. */
function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function Countdown({ ms, onExpire }: { ms: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(ms);

  useEffect(() => {
    setRemaining(ms);
    const started = Date.now();
    const tick = setInterval(() => {
      const left = ms - (Date.now() - started);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [ms, onExpire]);

  return (
    <span className="countdown figure" role="timer" aria-live="off">
      Try again in {clock(remaining)}
    </span>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function SignInForm() {
  const [state, formAction, pending] = useActionState(run, IDLE);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  /**
   * Checked as they leave the field, not while they type. Correcting someone
   * mid-word is rude, so this is set on blur and cleared on the next keystroke.
   */
  const [blurFault, setBlurFault] = useState<string | null>(null);
  /**
   * Which answer has been read and put away — by typing over it, by "Change
   * email", or by a lock running out. Held as the state object itself rather
   * than a flag: every submission returns a fresh one, so the next answer is
   * never mistaken for the dismissed one.
   */
  const [dismissed, setDismissed] = useState<SignInState | null>(null);
  const [resentAt, setResentAt] = useState<number | null>(null);

  const live: SignInState = state === dismissed ? IDLE : state;

  const emailMessage = blurFault ?? faultFor(live, 'email');
  const passwordMessage = faultFor(live, 'password');

  function onEmailChange(value: string) {
    setEmail(value);
    setBlurFault(null);
    setDismissed(state);
  }

  /* ── the cards that replace the form entirely ─────────────────────── */

  if (live.kind === 'locked') {
    return (
      <div className="entry-card">
        <div className="notice notice-over">
          <span className="lock-badge" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round">
              <rect x="2.6" y="5.2" width="6.8" height="5.2" />
              <path d="M4.2 5.2V3.6a1.8 1.8 0 0 1 3.6 0v1.6" />
            </svg>
          </span>
          <div className="notice-text">
            <span className="notice-title">Locked for 15 minutes</span>
            <span className="notice-copy">
              Five wrong passwords in a row. Nobody has been signed out of the app, and your data
              is untouched.
            </span>
          </div>
        </div>
        <Link className="btn btn-primary entry-action" href="/reset">
          Send a reset link
        </Link>
        <Countdown ms={live.unlocksInMs} onExpire={() => setDismissed(state)} />
      </div>
    );
  }

  if (live.kind === 'unverified') {
    return (
      <div className="entry-card">
        <div className="notice notice-near">
          <StatusGlyph status="near" size={14} />
          <div className="notice-text">
            <span className="notice-title">One step left</span>
            <span className="notice-copy">
              {resentAt === null ? (
                <>
                  We sent a link to <span className="figure">{live.email}</span>
                  {live.sentDaysAgo !== null && live.sentDaysAgo > 0
                    ? ` ${live.sentDaysAgo === 1 ? 'a day' : `${live.sentDaysAgo} days`} ago`
                    : ''}
                  . Open it and you are in.
                </>
              ) : (
                <>
                  On its way to <span className="figure">{live.email}</span> again. Open it and you
                  are in.
                </>
              )}
            </span>
          </div>
        </div>
        <div className="entry-row">
          <button
            type="button"
            className="btn btn-primary entry-action"
            onClick={() => {
              void resendVerification(live.email).then((r) => setResentAt(r.sentAt));
            }}
          >
            Send it again
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setDismissed(state);
              setPassword('');
            }}
          >
            Change email
          </button>
        </div>
      </div>
    );
  }

  if (live.kind === 'unreachable') {
    return (
      <div className="entry-card">
        <div className="notice notice-flat">
          <StatusGlyph status="incomplete" size={14} />
          <div className="notice-text">
            <span className="notice-title">We could not reach Costbook</span>
            <span className="notice-copy">
              Your details were not wrong — the connection dropped. Nothing was sent anywhere.
            </span>
          </div>
        </div>
        <button type="button" className="btn entry-action" onClick={() => setDismissed(state)}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M16 10a6 6 0 1 1-1.8-4.2M16 4v3h-3" />
          </svg>
          Try again
        </button>
        <span className="entry-status figure">status.costbook.app</span>
      </div>
    );
  }

  /* ── the form ─────────────────────────────────────────────────────── */

  const unknown = live.kind === 'unknown-email' ? live : null;
  const wrong = live.kind === 'wrong-password' ? live : null;

  return (
    <form className="entry-card" action={formAction} noValidate>
      <div className="entry-head">
        <h1 className="entry-title">Sign in</h1>
        <span className="entry-sub">Back to your menu.</span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="email">Email</label>
        <div
          className={`field-control${emailMessage ? ' is-wrong' : ''}${unknown ? ' is-near' : ''}${pending ? ' is-locked' : ''}`}
        >
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@yourcafé.com"
            className="field-input"
            value={email}
            disabled={pending}
            aria-invalid={emailMessage !== null || unknown !== null}
            aria-describedby={emailMessage || unknown ? 'email-fault' : undefined}
            onChange={(e) => onEmailChange(e.target.value)}
            onBlur={(e) => setBlurFault(e.target.value === '' ? null : (emailFault(e.target.value)?.message ?? null))}
          />
        </div>
        {emailMessage && (
          <span id="email-fault">
            <Fault tone="over">{emailMessage}</Fault>
          </span>
        )}
        {!emailMessage && unknown && (
          <span id="email-fault">
            <Fault tone="near">
              No account on that address.
              {unknown.suggestion && (
                <>
                  {' '}Did you mean{' '}
                  <button
                    type="button"
                    className="suggestion"
                    onClick={() => {
                      setEmail(unknown.suggestion ?? '');
                      setDismissed(state);
                    }}
                  >
                    {unknown.suggestion}
                  </button>
                  ?
                </>
              )}
            </Fault>
          </span>
        )}
      </div>

      <div className="field">
        <div className="field-label-row">
          <label className="field-label" htmlFor="password">Password</label>
          <Link className="link link-sm" href="/reset">Forgot it?</Link>
        </div>
        <div
          className={`field-control${passwordMessage || wrong ? ' is-wrong' : ''}${pending ? ' is-locked' : ''}`}
        >
          <input
            id="password"
            name="password"
            type={shown ? 'text' : 'password'}
            autoComplete="current-password"
            className={`field-input${shown ? '' : ' is-masked'}`}
            value={password}
            disabled={pending}
            aria-invalid={passwordMessage !== null || wrong !== null}
            aria-describedby={passwordMessage || wrong ? 'password-fault' : undefined}
            onChange={(e) => {
              setPassword(e.target.value);
              setDismissed(state);
            }}
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
        {passwordMessage && (
          <span id="password-fault">
            <Fault tone="over">{passwordMessage}</Fault>
          </span>
        )}
        {!passwordMessage && wrong && (
          <span id="password-fault">
            <Fault tone="over">
              That password does not match this email.{' '}
              <span className="figure strong">{wrong.triesLeft}</span>{' '}
              {wrong.triesLeft === 1 ? 'try' : 'tries'} left before we lock the account for 15
              minutes.
            </Fault>
          </span>
        )}
      </div>

      <button type="submit" className="btn btn-primary entry-action" disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            Signing in
          </>
        ) : (
          'Sign in'
        )}
      </button>

      {wrong && (
        <Link className="btn entry-action" href="/sign-in/link">
          Email me a sign-in link instead
        </Link>
      )}

      <div className="entry-divider">
        <span />
        <span className="entry-divider-label">new here</span>
        <span />
      </div>

      {/*
        A33: this slot used to hold a second filled button, which left the card
        with two primary actions. Account creation is a foot line now — where
        people look for it — and the card has one thing to press.
      */}
      <span className="entry-foot">
        New here? <Link className="link link-sm" href="/sign-up">Create an account.</Link>
        {' '}Free for your first {FREE_LIMITS.recipes} dishes. No card.
      </span>
    </form>
  );
}

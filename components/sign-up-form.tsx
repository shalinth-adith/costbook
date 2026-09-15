'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { confirmSignUp, createAccount, resendSignUp } from '@/app/sign-up/actions';
import { CODE_LENGTH, codeFault as faultOf, digitsOf } from '@/lib/verify';

import { MIN_PASSWORD, PASSWORD_RULE } from './entry-shell';
import { unstable_rethrow } from 'next/navigation';

/**
 * Sign up (A31).
 *
 * Two fields only. Business name is step 1 of the wizard; asking here means
 * asking twice, and a form with the whole of setup before the account exists loses
 * people who would have finished five after it.
 */
/** How long "confirmed" stays on screen before the book opens. */
const VERIFIED_BEAT_MS = 1100;

export function SignUpForm() {
  const [pending, start] = useTransition();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [tooEarly, setTooEarly] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState('');
  const [codeFault, setCodeFault] = useState<string | null>(null);
  /** A newer code has just gone out, so the older one has stopped working. */
  const [fresh, setFresh] = useState(false);
  /** The code worked; where the book opens. Shown for a beat, then followed. */
  const [verified, setVerified] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    if (verified === null) return;
    // Long enough to be read, short enough not to be waited for.
    const t = window.setTimeout(() => router.push(verified), VERIFIED_BEAT_MS);
    return () => window.clearTimeout(t);
  }, [verified, router]);

  const longEnough = password.length >= MIN_PASSWORD;
  const short = MIN_PASSWORD - password.length;

  const [fault, setFault] = useState<string | null>(null);

  const submit = () => {
    if (!longEnough) { setTooEarly(true); return; }
    setFault(null);
    start(async () => {
      const out = await createAccount(email, password);
      // Whatever comes back is either the code screen or something the
      // operator has to be told about.
      if (out.kind === 'fields') { setFault(out.message); return; }
      if (out.kind === 'failed') { setFault(out.message); return; }
      if (out.kind === 'sent') setSent(out.email);
    });
  };

  const confirm = () => {
    const fault = faultOf(code);
    if (fault !== null) { setCodeFault(fault); return; }
    setCodeFault(null);
    start(async () => {
      try {
        const out = await confirmSignUp(sent ?? email, code);
        if (out.kind === 'verified') { setVerified(out.next); return; }
        setCodeFault(out.message);
      } catch (error) {
        unstable_rethrow(error);
        setCodeFault('That did not go through. Try again in a moment.');
      }
    });
  };

  /*
   * Ask for another code.
   *
   * This existed and was never put on the screen, which is the whole of the
   * bug: a refused code says "ask for another and it will arrive in a moment"
   * and the only control on that screen was "Wrong address?" — which goes back
   * and signs up again, minting a third code and leaving an inbox with several
   * that look alike.
   *
   * Asking retires the code before it. Supabase keeps one token per account,
   * so the new mail does not join the old one, it replaces it — said out loud
   * here because the refusal cannot distinguish stale from expired.
   */
  const resend = () => {
    setCooldown(45);
    setCode('');
    setCodeFault(null);
    setFresh(false);
    // Actually send one. The countdown used to be the whole of this function.
    start(async () => {
      const out = await resendSignUp(sent ?? email);
      if (out.ok) setFresh(true);
      else setCodeFault(out.message ?? 'That did not send. Try again in a moment.');
    });
    const tick = window.setInterval(() => {
      setCooldown((n) => {
        if (n <= 1) { window.clearInterval(tick); return 0; }
        return n - 1;
      });
    }, 1000);
  };

  if (verified !== null) {
    return (
      <div key="done" className="entry-card entry-done" role="status" aria-live="polite">
        <span className="entry-done-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="entry-done-svg"><path d="M5 12.5l4.5 4.5L19 7.5" pathLength="100" /></svg>
        </span>
        <h1 className="entry-title">Address confirmed.</h1>
        <p className="entry-sub">Opening your book&hellip;</p>
      </div>
    );
  }

  if (sent !== null) {
    return (
      <form
        key="code"
        className="entry-card"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        {/* The heading is "your account exists", not "check your email" — the
            anxiety at this moment is that closing the tab loses the work. */}
        <h1 className="entry-title">Your account exists. Now prove the address.</h1>
        {/* The same words for a new address and one that already has an
            account: the owner's letter says which, and the screen does not. */}
        <p className="entry-sub">
          We&rsquo;ve sent a six-digit code to <b>{sent}</b>. Type it here and you&rsquo;re in.
        </p>

        <div className="field">
          <div className="field-label-row">
            <label className="field-label" htmlFor="code">
              The code from the email
            </label>
          </div>
          <div className={`field-control${codeFault !== null ? ' is-wrong' : ''}${pending ? ' is-locked' : ''}`}>
            <input
              id="code"
              name="code"
              className="field-input code-input figure"
              /*
               * `one-time-code` is what lets a phone offer the code from the
               * notification without opening the mail at all, and inputMode
               * brings up the number pad. Type stays text: a number input
               * strips a leading zero and offers a spinner nobody wants.
               */
              autoComplete="one-time-code"
              inputMode="numeric"
              placeholder="123456"
              maxLength={12}
              autoFocus
              disabled={pending}
              value={code}
              aria-invalid={codeFault !== null}
              aria-describedby={codeFault ? 'code-fault' : undefined}
              onChange={(e) => {
                setCode(digitsOf(e.target.value));
                setCodeFault(null);
              }}
            />
          </div>
          {codeFault !== null && (
            <span id="code-fault" className="fault">
              {codeFault}
            </span>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary entry-action"
          disabled={pending || digitsOf(code).length < CODE_LENGTH}
        >
          {pending ? 'Checking…' : 'Confirm and continue'}
        </button>

        {fresh && (
          <p className="entry-note">
            A new code is on its way. The one before it has stopped working — use the newest
            email.
          </p>
        )}

        {/*
          * The way out of a refused code.
          *
          * "That code has expired or does not match. Ask for another" was on
          * this screen for a week with nothing to ask with.
          */}
        <p className="entry-foot">
          Didn&rsquo;t arrive? Check the spam folder, or{' '}
          <button
            type="button"
            className="link link-sm"
            onClick={resend}
            disabled={pending || cooldown > 0}
          >
            {cooldown > 0 ? `send a new code (${String(cooldown)}s)` : 'send a new code'}
          </button>
          .{' '}
          <button type="button" className="link link-sm" onClick={() => setSent(null)}>
            Wrong address?
          </button>
        </p>
        {/*
          * A code rather than a link, and no link beside it.
          *
          * Both are spellings of one token, so a mail scanner that fetches the
          * link spends the code with it — which is exactly what happened to
          * this product's first real confirmation mail. See lib/verify.ts.
          */}
      </form>
    );
  }

  return (
    <div className="entry-card">
      <h1 className="entry-title">Create an account</h1>
      <p className="entry-sub">Two things, and they&rsquo;re both about you rather than your menu.</p>

      <label className="field">
        <span className="field-label-row"><span className="field-label">Email</span></span>
        <input
          className="field-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="email-input"
        />
      </label>

      <label className="field">
        <span className="field-label-row">
          <span className="field-label">Password</span>
          <button type="button" className="field-toggle" onClick={() => setShow((v) => !v)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
        <input
          className="field-input"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setTooEarly(false); }}
          data-testid="password-input"
        />
        {/* Stated before a key is pressed, counted down while typing, and only
            faulted if the button is pressed too early — never mid-word. */}
        <span
          className={tooEarly && !longEnough ? 'field-fault field-fault-over' : 'field-label'}
          data-ok={longEnough}
        >
          {longEnough
            ? '✓ Long enough'
            : password.length === 0
              ? PASSWORD_RULE
              : `${short} more character${short === 1 ? '' : 's'}`}
        </span>
      </label>

      {fault !== null && (
        <p className="field-fault field-fault-over">{fault}</p>
      )}

      <button type="button" className="btn btn-primary entry-action" disabled={pending} onClick={submit}>
        {pending ? 'Creating your account…' : 'Create my account'}
      </button>
      <p className="entry-foot">
        Next you&rsquo;ll set up your book — your restaurant, then the rules you price by. About a minute.
      </p>

      {/*
        * A31 offers a sign-in link here as well, and it is not offered yet.
        *
        * What stood here called `setSent(email)` and nothing else — no server
        * call at all — and dropped the visitor on "Your account exists. Now
        * open the email." No account existed and no email had been sent. The
        * next screen then offered "Send it again", which ran a countdown in
        * the browser and sent nothing, and a button onward to setup,
        * which the proxy bounced to /sign-in because there was no session.
        * A person following that path could not tell any of it, and waited.
        *
        * It comes back with a domain and a mail provider, as a real
        * `signInWithOtp`.
        */}

      <p className="entry-foot">
        Already have an account? <Link href="/sign-in" className="link link-sm">Sign in</Link>
      </p>
    </div>
  );
}

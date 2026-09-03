'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { createAccount, resendSignUp } from '@/app/sign-up/actions';

import { MIN_PASSWORD, PASSWORD_RULE } from './entry-shell';

/**
 * Sign up (A31).
 *
 * Two fields only. Business name is step 1 of the wizard; asking here means
 * asking twice, and a form with four questions before the account exists loses
 * people who would have finished five after it.
 */
export function SignUpForm() {
  const [pending, start] = useTransition();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [tooEarly, setTooEarly] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const longEnough = password.length >= MIN_PASSWORD;
  const short = MIN_PASSWORD - password.length;

  const [fault, setFault] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  const submit = () => {
    if (!longEnough) { setTooEarly(true); return; }
    setFault(null);
    setExists(false);
    start(async () => {
      const out = await createAccount(email, password);
      // A successful sign-up redirects on the server, so anything that comes
      // back is something the operator has to be told about.
      if (out.kind === 'exists') { setExists(true); return; }
      if (out.kind === 'fields') { setFault(out.message); return; }
      if (out.kind === 'failed') { setFault(out.message); return; }
      if (out.kind === 'sent') setSent(out.email);
    });
  };

  const resend = () => {
    setCooldown(45);
    // Actually send one. The countdown used to be the whole of this function.
    start(async () => {
      const out = await resendSignUp(sent ?? email);
      if (!out.ok) setFault(out.message ?? 'That did not send. Try again in a moment.');
    });
    const tick = window.setInterval(() => {
      setCooldown((n) => {
        if (n <= 1) { window.clearInterval(tick); return 0; }
        return n - 1;
      });
    }, 1000);
  };

  if (sent !== null) {
    return (
      <div className="entry-card">
        {/* The heading is "your account exists", not "check your email" — the
            anxiety at this moment is that closing the tab loses the work. */}
        <h1 className="entry-title">Your account exists. Now open the email.</h1>
        <p className="entry-sub">
          We&rsquo;ve sent a link to <b>{sent}</b>. Open it on any device and you&rsquo;ll go
          straight to the four questions.
        </p>

        <div className="notice notice-flat">
          <p className="notice-title">You can close this tab.</p>
          <p className="notice-text">
            Nothing is lost and nothing is half-made. The link works for 24 hours, and if it lapses
            we&rsquo;ll send another the next time you try to sign in.
          </p>
        </div>

        <button
          type="button"
          className="btn entry-action"
          disabled={cooldown > 0}
          onClick={resend}
        >
          {cooldown > 0 ? `Sent — try again in ${cooldown}s` : 'Send it again'}
        </button>
        {cooldown > 0 && (
          <p className="entry-foot">
            Sent. Pressing again won&rsquo;t make it arrive faster — the counter is there so a
            second press feels answered rather than ignored.
          </p>
        )}
        <p className="entry-foot">Check the spam folder first — that&rsquo;s where it usually is.</p>
        <p className="entry-foot">
          Wrong address?{' '}
          <button type="button" className="link link-sm" onClick={() => setSent(null)}>
            Change it
          </button>{' '}
          and we&rsquo;ll send again — the account moves with it, nothing is created twice.
        </p>
        {/*
          * No "continue to the four questions" button.
          *
          * It pushed /setup, and this screen is only ever shown to somebody
          * who has no session yet — so the proxy sent them to /sign-in, which
          * reads as the account having failed to be made. The link in the mail
          * is what carries a session, and it is the only thing that can.
          */}
      </div>
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

      {/* Worded identically whether the address has an account or not, with a
          route to sign-in — so the form cannot be used to find out who does. */}
      {exists && (
        <div className="notice notice-flat">
          <p className="notice-title">If this address already has an account, we&rsquo;ve sent a sign-in link to it.</p>
          <p className="notice-text">
            Check your email rather than making a second account.{' '}
            <Link href="/sign-in" className="link link-sm">Sign in instead</Link>
          </p>
        </div>
      )}
      {fault !== null && (
        <p className="field-fault field-fault-over">{fault}</p>
      )}

      <button type="button" className="btn btn-primary entry-action" disabled={pending} onClick={submit}>
        {pending ? 'Creating your account…' : 'Create my account'}
      </button>
      <p className="entry-foot">
        Next you&rsquo;ll answer four short questions about your place — about a minute.
      </p>

      {/*
        * A31 offers a sign-in link here as well, and it is not offered yet.
        *
        * What stood here called `setSent(email)` and nothing else — no server
        * call at all — and dropped the visitor on "Your account exists. Now
        * open the email." No account existed and no email had been sent. The
        * next screen then offered "Send it again", which ran a countdown in
        * the browser and sent nothing, and a button to the four questions,
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

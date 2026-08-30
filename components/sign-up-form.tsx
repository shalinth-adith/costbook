'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { MIN_PASSWORD, PASSWORD_RULE } from './entry-shell';

/**
 * Sign up (A31).
 *
 * Two fields only. Business name is step 1 of the wizard; asking here means
 * asking twice, and a form with four questions before the account exists loses
 * people who would have finished five after it.
 */
export function SignUpForm() {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [tooEarly, setTooEarly] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const longEnough = password.length >= MIN_PASSWORD;
  const short = MIN_PASSWORD - password.length;

  const submit = () => {
    if (!longEnough) { setTooEarly(true); return; }
    start(async () => {
      // No account is created here yet — auth lands with Supabase at step 12.
      setSent(email);
    });
  };

  const resend = () => {
    setCooldown(45);
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
        {/* Dev convenience: the wizard is what the link leads to. */}
        <button type="button" className="btn btn-primary entry-action" onClick={() => router.push('/setup')}>
          Continue to the four questions
        </button>
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

      <button type="button" className="btn btn-primary entry-action" disabled={pending} onClick={submit}>
        {pending ? 'Creating your account…' : 'Create my account'}
      </button>
      <p className="entry-foot">
        Next you&rsquo;ll answer four short questions about your place — about a minute.
      </p>

      <div className="entry-divider"><span className="entry-divider-label">or</span></div>

      <button type="button" className="btn entry-action" onClick={() => { if (email !== '') setSent(email); }}>
        Email me a sign-in link instead
      </button>
      <p className="entry-foot">
        No password to invent or remember. Good if you&rsquo;ll be signing in on a kitchen tablet.
      </p>

      <p className="entry-foot">
        Already have an account? <Link href="/sign-in" className="link link-sm">Sign in</Link>
      </p>
    </div>
  );
}

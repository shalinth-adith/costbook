'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { MIN_PASSWORD, PASSWORD_RULE } from './entry-shell';

type Step = 'ask' | 'sent' | 'choose';

/**
 * Forgotten password (A33).
 *
 * Three small screens on the A10 card. The confirmation is worded identically
 * whether the address has an account or not, so this screen cannot be used to
 * find out who does.
 */
export function ResetForm({ start = 'ask' }: { start?: Step }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(start);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD;

  if (step === 'sent') {
    return (
      <div className="entry-card">
        <h1 className="entry-title">If this address has an account, we&rsquo;ve sent a link.</h1>
        <p className="entry-sub">
          Check <b>{email || 'your inbox'}</b>, including the spam folder. The link works for one
          hour and can only be used once.
        </p>
        {/* The fear at this moment is having locked yourself out by asking. */}
        <div className="notice notice-flat">
          <p className="notice-title">Your old password still works until you use the link.</p>
          <p className="notice-text">
            Asking for a reset doesn&rsquo;t lock you out, and it doesn&rsquo;t sign anyone out of
            the app.
          </p>
        </div>
        <button type="button" className="btn entry-action" onClick={() => setStep('ask')}>
          Try a different address
        </button>
        <p className="entry-foot">
          Worded the same whether the address has an account or not — so this screen can&rsquo;t be
          used to find out who does.
        </p>
        <button type="button" className="btn btn-primary entry-action" onClick={() => setStep('choose')}>
          Open the link
        </button>
      </div>
    );
  }

  if (step === 'choose') {
    return (
      <div className="entry-card">
        <h1 className="entry-title">Choose a new password</h1>
        <p className="entry-sub">For {email || 'your account'}.</p>

        <label className="field">
          <span className="field-label-row">
            <span className="field-label">New password</span>
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

        {/* One field, no confirm box. A confirm-password box catches typists
            who can already see what they typed, and Show does that job better. */}
        <button
          type="button"
          className="btn btn-primary entry-action"
          disabled={!longEnough}
          onClick={() => router.push('/dashboard')}
        >
          Save it and take me in
        </button>
        <p className="entry-foot">
          This signs you in as well — no second trip through the sign-in screen.
        </p>
      </div>
    );
  }

  return (
    <div className="entry-card">
      <h1 className="entry-title">Set a new password</h1>
      <p className="entry-sub">
        Tell us the address you sign in with and we&rsquo;ll send a link. Nothing changes until you
        use it.
      </p>

      <label className="field">
        <span className="field-label-row"><span className="field-label">Email</span></span>
        <input
          className="field-input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <button type="button" className="btn btn-primary entry-action" onClick={() => setStep('sent')}>
        Send me a link
      </button>
      <p className="entry-foot">
        Remembered it? <Link href="/sign-in" className="link link-sm">Back to sign in</Link>
      </p>
    </div>
  );
}

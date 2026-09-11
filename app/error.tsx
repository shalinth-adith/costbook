'use client';

import { useEffect, useState } from 'react';

import { Wordmark } from '@/components/wordmark';
import { reportFault } from '@/lib/report';

import './legal.css';
import { SUPPORT_EMAIL } from "@/lib/org";

/**
 * A30 · the error page.
 *
 * It says what was kept before it says anything else. One copyable reference in
 * mono, and a second action that opens a message with it already attached — the
 * user should never be asked to describe an error twice.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    /*
     * Reported automatically, as the page claims.
     *
     * It said that from the day it was written and only wrote to the reader's
     * own console, so the sentence below was false to their face. It writes to
     * `app_errors` now, and the back office reads it.
     */
    console.error('[costbook] unhandled', error);
    // `detail` is spread in rather than set to undefined:
    // exactOptionalPropertyTypes distinguishes "absent" from "undefined", and
    // an error without a stack has no detail rather than an empty one.
    void reportFault({
      where: window.location.pathname,
      message: error.message,
      ...(error.stack === undefined ? {} : { detail: error.stack }),
    });
  }, [error]);

  const ref = (error.digest ?? 'CB-LOCAL').toUpperCase();

  return (
    <div className="legal is-narrow">
      <header className="legal-top"><Wordmark mode="public" /></header>
      <main>
        <p className="legal-code">SOMETHING BROKE</p>
        <h1>That failed on our side, not yours.</h1>
        <p>
          Nothing you were working on has been lost — anything typed is held as a draft. We&rsquo;ve
          been told about it automatically, and it carries the reference below if you&rsquo;d rather
          ask us directly.
        </p>
        <p className="legal-ref figure">{ref}</p>
        <div className="legal-actions">
          <button type="button" className="btn btn-primary" onClick={reset}>Try that again</button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void navigator.clipboard?.writeText(ref).then(() => setCopied(true));
            }}
          >
            {copied ? 'Reference copied' : 'Copy the reference'}
          </button>
          <a className="btn" href={`mailto:${SUPPORT_EMAIL}?subject=Costbook%20error%20${ref}`}>
            Tell us what you were doing
          </a>
        </div>
      </main>
    </div>
  );
}

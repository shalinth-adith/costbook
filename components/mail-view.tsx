'use client';

import { useState, useTransition } from 'react';

export interface Letter {
  readonly id: string;
  readonly to: string;
  readonly subject: string;
  readonly body: string;
  readonly queuedAt: string;
  readonly sentAt: string | null;
  readonly attempts: number;
  readonly lastError: string | null;
}

/** The outbox, and the one button that empties it. */
export function MailView({
  letters,
  configured,
  onPost,
}: {
  letters: readonly Letter[];
  configured: boolean;
  onPost: () => Promise<{ message: string }>;
}) {
  const [said, setSaid] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const waiting = letters.filter((l) => l.sentAt === null);

  const when = (at: string) =>
    new Date(at).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <>
      <div className="bo-mailbar">
        <p className="bo-lede">
          <b className="figure">{waiting.length}</b> waiting,{' '}
          <b className="figure">{letters.length - waiting.length}</b> sent.{' '}
          {configured
            ? 'A provider is configured, so these go out when you press send.'
            : 'No provider is configured, so nothing has been posted — every reply is already on the operator’s Help screen, and these are the copies waiting for the day mail is switched on.'}
        </p>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || waiting.length === 0}
          onClick={() => { start(async () => { setSaid((await onPost()).message); }); }}
        >
          {busy ? 'Sending…' : `Send ${String(waiting.length)} waiting`}
        </button>
      </div>
      {said !== null && <p className="bo-conv-said bo-mailsaid" role="status">{said}</p>}

      {letters.length === 0 ? (
        <p className="bo-quiet">Nothing has been written.</p>
      ) : (
        <ul className="bo-letters">
          {letters.map((l) => (
            <li key={l.id} className={`bo-letter${l.sentAt === null ? '' : ' is-sent'}`}>
              <span className="bo-letter-to">{l.to}</span>
              <span className="bo-letter-subject">{l.subject}</span>
              <span className="figure bo-letter-when">{when(l.queuedAt)}</span>
              <span className={`bo-letter-state is-${l.sentAt === null ? 'waiting' : 'sent'}`}>
                {l.sentAt === null ? 'waiting' : 'sent'}
              </span>
              {l.lastError !== null && (
                <span className="bo-letter-error">
                  refused {l.attempts}× — {l.lastError}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

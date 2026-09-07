'use client';

import { useState, useTransition } from 'react';

import type { Ack } from '@/app/help/actions';

export interface Message {
  readonly id: string;
  readonly fromAdmin: boolean;
  readonly body: string;
  readonly at: string;
}
export interface HelpThread {
  readonly id: string;
  readonly subject: string;
  readonly status: 'open' | 'answered' | 'closed';
  readonly openedAt: string;
  readonly messages: readonly Message[];
}

/**
 * Asking, and reading the answer.
 *
 * A thread rather than an email because there is no mail provider, and an
 * answer that cannot reach anybody is not an answer. It is read the next time
 * they open Costbook — the same reasoning as a flag on a dish.
 *
 * The address is still on the page. This screen adds a door; it does not
 * close the one that was already there.
 */
export function HelpView({
  threads,
  onAsk,
  onReply,
}: {
  threads: readonly HelpThread[];
  onAsk: (subject: string, body: string) => Promise<Ack>;
  onReply: (threadId: string, body: string) => Promise<Ack>;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [said, setSaid] = useState<Ack | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, start] = useTransition();

  const when = (at: string) =>
    new Date(at).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="hp">
      <section className="hp-ask">
        <h2 className="hp-h2">Ask us something</h2>
        <p className="hp-lede">
          This reaches the people who build Costbook, and the reply appears on
          this page — so you do not have to watch an inbox. If a sheet will not
          import, say so and we will ask for it: a file we cannot read is a bug
          on our side.
        </p>

        <label className="field">
          <span className="label">What it is about</span>
          <input
            className="wiz-input"
            value={subject}
            maxLength={160}
            placeholder="The import stopped at the mapping step"
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">What happened</span>
          <textarea
            className="nd-paste hp-text"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="As much or as little as you like."
          />
        </label>

        <div className="hp-act">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || subject.trim() === '' || body.trim() === ''}
            onClick={() => {
              start(async () => {
                const ack = await onAsk(subject, body);
                setSaid(ack);
                if (ack.ok) { setSubject(''); setBody(''); }
              });
            }}
          >
            {busy ? 'Sending…' : 'Send it'}
          </button>
          <span className="hp-or">
            or write to <a href="mailto:hello@costbook.in">hello@costbook.in</a>
          </span>
        </div>
        {said !== null && (
          <p className={`hp-said${said.ok ? ' is-ok' : ' is-bad'}`} role="status">{said.message}</p>
        )}
      </section>

      <section className="hp-threads">
        <h2 className="hp-h2">
          What you have asked{threads.length > 0 ? ` (${String(threads.length)})` : ''}
        </h2>
        {threads.length === 0 ? (
          <p className="hp-none">Nothing yet.</p>
        ) : (
          threads.map((t) => (
            <article key={t.id} className={`hp-thread is-${t.status}`}>
              <header className="hp-thread-head">
                <h3>{t.subject}</h3>
                <span className={`hp-state is-${t.status}`}>
                  {t.status === 'open' ? 'waiting on us' : t.status === 'answered' ? 'answered' : 'closed'}
                </span>
              </header>
              <ol className="hp-msgs">
                {t.messages.map((m) => (
                  <li key={m.id} className={`hp-msg${m.fromAdmin ? ' is-us' : ''}`}>
                    <span className="hp-msg-who">{m.fromAdmin ? 'Costbook' : 'You'}</span>
                    <p>{m.body}</p>
                    <span className="figure hp-msg-at">{when(m.at)}</span>
                  </li>
                ))}
              </ol>
              {replyTo === t.id ? (
                <div className="hp-reply">
                  <textarea
                    className="nd-paste hp-text"
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                  />
                  <div className="hp-act">
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || reply.trim() === ''}
                      onClick={() => {
                        start(async () => {
                          const ack = await onReply(t.id, reply);
                          setSaid(ack);
                          if (ack.ok) { setReply(''); setReplyTo(null); }
                        });
                      }}
                    >
                      {busy ? 'Sending…' : 'Send'}
                    </button>
                    <button type="button" className="btn" onClick={() => setReplyTo(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="link" onClick={() => { setReplyTo(t.id); setReply(''); }}>
                  Add to this
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';

import type { Ack } from '@/app/help/actions';

/**
 * The six a kitchen actually asks, answered before they have to ask.
 *
 * Every answer is true of the product as built — the same discipline the
 * landing page's questions keep. Native `<details>`: the browser handles
 * open, close and the keyboard, and there is no script to load on the one
 * screen somebody opens when something is already wrong.
 */
const HELP_QUESTIONS: readonly (readonly [string, string])[] = [
  [
    'A figure looks wrong',
    'Open it. Every cost on a dish shows its working — the batch total, the portions, the rate on each line. Most of the time the answer is on the screen: a yield entered as 100%, or a rate typed per pack rather than per kilo. If it still looks wrong, write below with the dish name and the figure you expected.',
  ],
  [
    'A sheet would not come in',
    'Send it. Costbook reads spreadsheets and CSVs as they are and asks once which column is which; a file it cannot read is a bug on our side, not a mistake on yours. Your file is only ever read — nothing in it is altered.',
  ],
  [
    'I changed a rate and nothing moved',
    'A rate moves the dishes that reach it, and a dish only reaches an ingredient through its own lines or through a sub-recipe. If a plate did not move, it does not carry that ingredient — open the dish and look at its components.',
  ],
  [
    'How do I undo a price list?',
    'Import, then the sheet you brought in. For seven days it can be rolled back: every rate it changed goes back to what it was, and so does every dish that moved because of it.',
  ],
  [
    'What happens when the free dishes run out?',
    'Everything you have costed stays costed, readable and printable, for as long as you like. To add another dish, or to bring a sheet in, you buy the book for a stretch of months from Your plan. There is no card kept on file.',
  ],
  [
    'Who can see my recipes?',
    'Nobody outside your account. Costbook reads across accounts only to count sign-ins and visits — never what you cook or what you pay. The privacy page says exactly what is kept, and what is not.',
  ],
];

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
          /*
            * The screen a stuck person opens should not be the plainest one
            * in the book. Nothing has been asked yet, and the six things most
            * people would have asked are answered here — the same six the
            * landing page answers, so the two can never drift — with the
            * address under them for the seventh.
            */
          <div className="hp-empty">
            <p className="hp-empty-said">
              Nothing yet. Anything you send lands here, and so does the reply —
              you need not watch an inbox.
            </p>
            <h3 className="hp-faq-h">While you are here</h3>
            <div className="hp-faq">
              {HELP_QUESTIONS.map(([q, a]) => (
                <details className="hp-faq-item" key={q}>
                  <summary className="hp-faq-q">
                    <span>{q}</span>
                    <span className="hp-faq-mark" aria-hidden="true" />
                  </summary>
                  <p className="hp-faq-a">{a}</p>
                </details>
              ))}
            </div>
          </div>
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

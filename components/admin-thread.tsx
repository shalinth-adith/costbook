'use client';

import { useState, useTransition } from 'react';

import type { Message } from './help-view';

/** One thread, read and answered. */
export function AdminThread({
  id,
  messages,
  onReply,
  onClose,
}: {
  id: string;
  messages: readonly Message[];
  onReply: (id: string, body: string) => Promise<{ ok: boolean; message: string }>;
  onClose: (id: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [body, setBody] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <div className="bo-conv">
      <ol className="bo-msgs">
        {messages.map((m) => (
          <li key={m.id} className={`bo-msg${m.fromAdmin ? ' is-us' : ''}`}>
            <span className="bo-msg-who">{m.fromAdmin ? 'You' : 'The kitchen'}</span>
            <p>{m.body}</p>
            <span className="figure bo-msg-at">
              {new Date(m.at).toLocaleString('en-GB', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </li>
        ))}
      </ol>

      <textarea
        className="bo-reply"
        rows={3}
        value={body}
        placeholder="They read this inside Costbook, not by email."
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="bo-conv-act">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || body.trim() === ''}
          onClick={() => {
            start(async () => {
              const ack = await onReply(id, body);
              setSaid(ack.message);
              if (ack.ok) setBody('');
            });
          }}
        >
          {busy ? 'Sending…' : 'Reply'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => { start(async () => { setSaid((await onClose(id)).message); }); }}
        >
          Close it
        </button>
        {said !== null && <span className="bo-conv-said">{said}</span>}
      </div>
    </div>
  );
}

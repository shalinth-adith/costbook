-- Mail that is written now and sent when there is somewhere to send it.
--
-- The product has never had a mail provider, and every screen that would have
-- needed one says so rather than pretending: the lockout screen offers a
-- person instead of a reset link, and a support reply lands in the product
-- because an answer that reaches nobody is not an answer.
--
-- This does not change that. It adds a queue. A reply is written down the
-- moment it is sent in the console, addressed and complete, and it waits.
-- When a provider is configured the queue drains and every message that has
-- been waiting goes out — with the date it was written, not the date it was
-- finally posted, so nobody is told "we replied today" about a thread that
-- has been open a week.
--
-- Nothing here sends anything. `lib/mail.ts` sends, and only when it has a
-- key; until then `sent_at` stays null and the console says so plainly.

-- Who to answer.
--
-- Captured when the thread opens, from the session, rather than looked up
-- later. The operator who wrote may not be the owner, may have left the
-- account by the time we reply, and `auth.users` is not readable from a
-- client — so the address is recorded at the one moment it is certainly
-- known and certainly theirs.
alter table support_threads
  add column if not exists reply_to text;

comment on column support_threads.reply_to is
  'The address to answer, captured from the session when the thread opened.';

-- ── the outbox ────────────────────────────────────────────────────────────
--
-- One row per message. It is the record of what was written, so it keeps its
-- own `queued_at` separate from `sent_at`: a reply written on Monday and
-- posted on Thursday was written on Monday, and the mail should say so.
create table if not exists mail_outbox (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null check (position('@' in to_email) > 1),
  subject    text not null,
  body       text not null,
  -- The conversation it belongs to, where it belongs to one. Set null on
  -- delete: the record that we answered somebody outlives the thread.
  thread_id  uuid references support_threads(id) on delete set null,
  queued_at  timestamptz not null default now(),
  sent_at    timestamptz,
  attempts   integer not null default 0,
  -- What the provider said when it refused. Null while never attempted.
  last_error text
);

-- The drain reads the unsent, oldest first.
create index if not exists mail_outbox_waiting
  on mail_outbox (queued_at)
  where sent_at is null;

alter table mail_outbox enable row level security;

/*
 * Admin only, all four verbs.
 *
 * A kitchen has no business reading what we have written to another kitchen,
 * and no business writing anything that will be posted under our name. The
 * only path that queues a message is the reply action, which already checks
 * `is_admin()` before it runs.
 */
drop policy if exists outbox_admin on mail_outbox;
create policy outbox_admin on mail_outbox
  for all using (is_admin()) with check (is_admin());

-- The back office: who may see across the whole product, and the two things
-- it needs somewhere to write to.
--
-- Everything in Costbook is scoped to one kitchen by RLS — `auth_org_ids()`
-- on every table, which is exactly right for the product and exactly wrong
-- for the person running it. This adds one identity that may read across
-- accounts, and nothing else changes: no existing policy is loosened, and a
-- caller who is not an admin sees precisely what they saw before.
--
-- Two tables are new because the questions they answer have nowhere to come
-- from today. Nothing records that the app broke, so "is it crashing?" has no
-- answer at all; and support is an email address, so "who is waiting on a
-- reply?" lives in an inbox rather than in the product.

-- ── who is an admin ───────────────────────────────────────────────────────
--
-- A table rather than a flag on a user, so the answer is a row somebody had
-- to insert deliberately. There is no application path that writes here: the
-- only way in is the SQL editor, which is the point.
create table if not exists app_admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  note     text,
  added_at timestamptz not null default now()
);

alter table app_admins enable row level security;

/*
 * Security definer, and stable.
 *
 * Definer because it reads `app_admins`, which RLS hides — a policy that
 * called a non-definer function reading the table it protects would recurse.
 * Stable so the planner hoists it out of the row loop rather than asking once
 * per row of every table it guards.
 */
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from app_admins where user_id = auth.uid())
$$;

-- An admin can see the list; nobody else can see that it exists.
drop policy if exists admins_read on app_admins;
create policy admins_read on app_admins for select using (is_admin());

-- ── reading across accounts ───────────────────────────────────────────────
--
-- One extra SELECT policy per table. Policies are OR-ed, so each of these
-- widens reading for an admin and leaves every existing rule exactly as it
-- was for everybody else. Read only: the console reports, it does not reach
-- into a kitchen's book and change it.
do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'memberships', 'subscriptions', 'payment_orders',
    'recipes', 'ingredients', 'ingredient_rate_history', 'imports', 'dish_sales'
  ] loop
    execute format('drop policy if exists admin_read on %I', t);
    execute format('create policy admin_read on %I for select using (is_admin())', t);
  end loop;
end $$;

-- ── what broke ────────────────────────────────────────────────────────────
--
-- Nothing anywhere records a failure, so the honest answer to "is the app
-- crashing" has been "we would not know". The error boundary and every server
-- action that swallows a fault write here.
--
-- WHAT IT MUST NOT HOLD. A message and where it happened, never a payload:
-- a rate, a dish name or an email address in an error row is a kitchen's data
-- sitting outside its own account with none of the rules that protect it.
create table if not exists app_errors (
  id        uuid primary key default gen_random_uuid(),
  -- Null for a fault with nobody signed in. Set null on delete: an account
  -- leaving must not erase the record that something broke.
  org_id    uuid references organizations(id) on delete set null,
  at        timestamptz not null default now(),
  -- The route or the action, e.g. '/recipes/[id]' or 'saveMonthSales'.
  at_where  text not null,
  message   text not null,
  -- The stack, where there is one. Trimmed by the writer.
  detail    text,
  -- An admin has looked at this one.
  seen      boolean not null default false
);

create index if not exists app_errors_recent on app_errors (at desc);

alter table app_errors enable row level security;

-- Anyone signed in may report a fault they hit; only an admin may read them.
-- A kitchen reading other kitchens' failures would be a leak by another name.
drop policy if exists errors_write on app_errors;
create policy errors_write on app_errors for insert with check (true);
drop policy if exists errors_read on app_errors;
create policy errors_read on app_errors for select using (is_admin());
drop policy if exists errors_mark on app_errors;
create policy errors_mark on app_errors for update using (is_admin()) with check (is_admin());

-- ── someone is waiting on a reply ─────────────────────────────────────────
--
-- The contact page deliberately has no form — its own comment says a form is
-- a way of not giving somebody an address, and that stands: hello@costbook.in
-- is still the door, and the only door for a stranger who cannot sign in.
--
-- This is the second door, for an operator who is already inside. It exists
-- because a reply has to reach them, and there is no mail provider yet: a
-- thread in the product is read the next time they open Costbook, which is
-- the same reasoning behind `flags`. Nothing here pretends to send an email.
create table if not exists support_threads (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references organizations(id) on delete cascade,
  opened_by uuid references auth.users(id) on delete set null,
  subject   text not null,
  status    text not null default 'open' check (status in ('open', 'answered', 'closed')),
  opened_at timestamptz not null default now(),
  -- Moves on every message, so an inbox can sort by who has waited longest.
  last_at   timestamptz not null default now()
);

create index if not exists support_threads_waiting on support_threads (status, last_at);

create table if not exists support_messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references support_threads(id) on delete cascade,
  from_admin boolean not null default false,
  -- Who wrote it, for the operator's side. Null on an admin message: the
  -- kitchen is answered by Costbook, not by a named person on a rota.
  wrote_by   uuid references auth.users(id) on delete set null,
  body       text not null check (length(btrim(body)) > 0),
  at         timestamptz not null default now()
);

create index if not exists support_messages_thread on support_messages (thread_id, at);

alter table support_threads enable row level security;
alter table support_messages enable row level security;

-- A kitchen sees its own threads and may open one and add to it. An admin
-- sees every thread and may reply to any.
drop policy if exists threads_own on support_threads;
create policy threads_own on support_threads
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));
drop policy if exists threads_admin on support_threads;
create policy threads_admin on support_threads for select using (is_admin());
drop policy if exists threads_admin_write on support_threads;
create policy threads_admin_write on support_threads
  for update using (is_admin()) with check (is_admin());

drop policy if exists messages_own on support_messages;
create policy messages_own on support_messages
  for all using (
    thread_id in (select id from support_threads where org_id in (select auth_org_ids()))
  )
  with check (
    thread_id in (select id from support_threads where org_id in (select auth_org_ids()))
    -- A kitchen cannot write a message that claims to be from us.
    and from_admin = false
  );
drop policy if exists messages_admin on support_messages;
create policy messages_admin on support_messages for select using (is_admin());
drop policy if exists messages_admin_write on support_messages;
create policy messages_admin_write on support_messages
  for insert with check (is_admin() and from_admin = true);

-- ── the accounts overview ─────────────────────────────────────────────────
--
-- One row per kitchen, with the owner's address. Definer because the address
-- lives in `auth.users`, which RLS does not expose to a client and should not:
-- granting the console a look at that table would open every account's login
-- to anything else that gets a session. This hands back one column of it, to
-- an admin, and nothing else.
create or replace function admin_accounts()
returns table (
  org_id       uuid,
  name         text,
  created_at   timestamptz,
  setup_done   boolean,
  owner_email  text,
  plan         text,
  status       text,
  period_end   timestamptz,
  recipes      bigint,
  ingredients  bigint,
  last_rate_at timestamptz,
  imports      bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    o.id,
    o.name,
    o.created_at,
    o.setup_done,
    u.email::text,
    coalesce(s.plan, 'free'),
    coalesce(s.status, 'active'),
    s.current_period_end,
    (select count(*) from recipes r where r.org_id = o.id),
    (select count(*) from ingredients i where i.org_id = o.id),
    (select max(h.changed_at) from ingredient_rate_history h
      join ingredients i2 on i2.id = h.ingredient_id where i2.org_id = o.id),
    (select count(*) from imports im where im.org_id = o.id and im.status = 'committed')
  from organizations o
  left join subscriptions s on s.org_id = o.id
  left join lateral (
    select m.user_id from memberships m
    where m.org_id = o.id and m.role = 'owner'
    order by m.created_at limit 1
  ) owner on true
  left join auth.users u on u.id = owner.user_id
  -- The guard is inside the function, because a definer function ignores RLS.
  where is_admin()
  order by o.created_at desc
$$;

revoke all on function admin_accounts() from public;
grant execute on function admin_accounts() to authenticated;
revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;

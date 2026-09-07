-- Who came back, and how often.
--
-- The back office counted what the books held: dishes costed, ingredients on
-- the shelves, how recently each kitchen moved a rate. Those are the kitchen's
-- own figures, and reading them across every account to decide how the product
-- is doing is both the wrong question and more than we should hold.
--
-- The right question is smaller and answerable: did they come back, and did
-- they use it when they did. That is two numbers a day per person — a login
-- and a visit — and nothing about what they cooked.
--
-- WHAT THIS DOES NOT RECORD. No page, no route, no recipe, no ingredient, no
-- action name. A row here says "this person opened their book on this day, N
-- times". It cannot say what they opened, and it is not written per request:
-- a visit is a stretch of work, counted once every ten minutes, so a day with
-- six visits is roughly an hour at the book.

create table if not exists app_use (
  org_id  uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  -- The database's own day. A kitchen's midnight is not ours, so a late-night
  -- visit can land on the next day's row; for a count of who came back that
  -- is noise, and a per-kitchen timezone would be a fiction we do not have.
  day     date not null default current_date,
  logins  integer not null default 0,
  visits  integer not null default 0,
  last_at timestamptz not null default now(),
  primary key (org_id, user_id, day)
);

comment on table app_use is
  'One row per person per day: how many times they signed in and how many stretches of work they did. Nothing about what they did.';

-- The console reads a window of days, newest first.
create index if not exists app_use_by_day on app_use (day desc);

alter table app_use enable row level security;

/*
 * Read: admins only. Write: nobody, directly.
 *
 * There is deliberately no insert or update policy. The only way a row is
 * written is `note_use()` below, which is security definer and takes the
 * person from the session rather than from its caller — so a client cannot
 * write a count against somebody else, or against a kitchen that is not
 * theirs, however it phrases the request.
 */
drop policy if exists use_admin_read on app_use;
create policy use_admin_read on app_use
  for select using (is_admin());

/*
 * Note one login or one visit for whoever is asking.
 *
 * `auth.uid()` and a membership lookup, never an argument: this function runs
 * with the owner's rights, so anything it trusted from its caller would be a
 * hole straight through row-level security. The only thing the caller gets to
 * say is which of the two kinds it is.
 */
create or replace function note_use(kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
begin
  if v_user is null then return; end if;

  select m.org_id into v_org
    from memberships m
   where m.user_id = v_user
   limit 1;
  if v_org is null then return; end if;

  insert into app_use (org_id, user_id, day, logins, visits)
  values (
    v_org, v_user, current_date,
    case when kind = 'login' then 1 else 0 end,
    case when kind = 'login' then 0 else 1 end
  )
  on conflict (org_id, user_id, day) do update
     set logins  = app_use.logins  + excluded.logins,
         visits  = app_use.visits  + excluded.visits,
         last_at = now();
end;
$$;

revoke all on function note_use(text) from public;
grant execute on function note_use(text) to authenticated;

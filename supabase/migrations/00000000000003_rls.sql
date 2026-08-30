-- Tenancy (TRD 8).
--
-- Every table carries org_id, except recipe_components and
-- ingredient_rate_history, which inherit through their parent.
--
-- The rule is enforced here rather than in the application because the
-- application is not the only thing that can issue a query. RLS holding "under
-- a direct query, not just through the UI" is the acceptance check for build
-- step 13.

-- Which orgs the caller belongs to. Wrapped in a function so the subquery is
-- written once, and marked stable so the planner can hoist it out of the row
-- loop rather than re-running it per row.
create or replace function auth_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select org_id from memberships where user_id = auth.uid()
$$;

-- True when the caller owns the org. Owner-only actions are checked here AND
-- again in the server action: never trust the client's idea of its own role.
create or replace function auth_owns(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target and role = 'owner'
  )
$$;

alter table organizations           enable row level security;
alter table outlets                 enable row level security;
alter table memberships             enable row level security;
alter table ingredients             enable row level security;
alter table ingredient_rate_history enable row level security;
alter table recipes                 enable row level security;
alter table recipe_components       enable row level security;
alter table imports                 enable row level security;
alter table invitations             enable row level security;
alter table subscriptions           enable row level security;

-- ── Org-scoped tables: the same shape on each ─────────────────────────────
create policy org_read on organizations
  for select using (id in (select auth_org_ids()));
-- Only an owner can rename the place or change how it costs.
create policy org_write on organizations
  for update using (auth_owns(id)) with check (auth_owns(id));

create policy outlets_all on outlets
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create policy ingredients_all on ingredients
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create policy recipes_all on recipes
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create policy imports_all on imports
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── Tables that inherit through a parent ──────────────────────────────────
create policy components_all on recipe_components
  for all using (
    recipe_id in (select id from recipes where org_id in (select auth_org_ids()))
  )
  with check (
    recipe_id in (select id from recipes where org_id in (select auth_org_ids()))
  );

-- Append-only: history can be read and written, never edited or deleted. A
-- rate that was true on a date stays true for that date.
create policy history_read on ingredient_rate_history
  for select using (
    ingredient_id in (select id from ingredients where org_id in (select auth_org_ids()))
  );
create policy history_append on ingredient_rate_history
  for insert with check (
    ingredient_id in (select id from ingredients where org_id in (select auth_org_ids()))
  );

-- ── Membership and billing: owner-gated ───────────────────────────────────
-- Everyone can see who is on the book; only an owner changes it.
create policy memberships_read on memberships
  for select using (org_id in (select auth_org_ids()));
create policy memberships_write on memberships
  for all using (auth_owns(org_id)) with check (auth_owns(org_id));

create policy invitations_owner on invitations
  for all using (auth_owns(org_id)) with check (auth_owns(org_id));

-- A manager cannot see the bill (A27).
create policy subscriptions_owner on subscriptions
  for all using (auth_owns(org_id)) with check (auth_owns(org_id));

-- ── Signup ────────────────────────────────────────────────────────────────
-- Creating an organisation is the one write with no membership to check
-- against: the membership is created a moment later, by the same transaction.
create policy org_create on organizations
  for insert with check (auth.uid() is not null);
create policy membership_bootstrap on memberships
  for insert with check (user_id = auth.uid());

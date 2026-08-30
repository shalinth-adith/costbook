-- What happens when an account is created (TRD build step 12).
--
-- A user with no membership can see nothing at all — RLS resolves every policy
-- through `memberships`, so an account without one is locked out of the org it
-- just created. That makes this the single most important write in the product,
-- and it must not be possible to skip it. So it runs as a trigger on
-- auth.users rather than as a step in a server action: a signup through any
-- path — the form, a magic link, the dashboard, a future OAuth provider —
-- lands here.

create or replace function handle_new_user()
returns trigger
language plpgsql
-- Writes organizations, outlets and memberships on behalf of a user who, at
-- this instant, has no membership and therefore passes no policy of their own.
security definer
set search_path = public, pg_temp
as $$
declare
  invite   invitations%rowtype;
  new_org  uuid;
begin
  -- A32: someone arriving on an invitation joins the book that already exists.
  -- They do not get an organisation of their own, and they do not go through
  -- the wizard — the café already has a currency, a tax treatment and a target,
  -- and asking them to configure a business that exists would either ask twice
  -- or throw their answers away.
  select * into invite
  from invitations
  where lower(email) = lower(new.email)
    and accepted_at is null
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    insert into memberships (org_id, user_id, role)
    values (invite.org_id, new.id, invite.role)
    on conflict (org_id, user_id) do nothing;

    update invitations set accepted_at = now() where id = invite.id;
    return new;
  end if;

  -- Otherwise this is an owner starting a new book.
  --
  -- The name is left empty rather than guessed. Costbook does not invent a
  -- figure the operator did not give, and a name is no different — deriving
  -- "Gmail Café" from an address would be exactly the kind of plausible wrong
  -- value the product exists to avoid. setup_done stays false, which is what
  -- routes them to the wizard, so the empty name is never seen.
  insert into organizations (name) values ('') returning id into new_org;

  -- Present from day one, invisible in v1. Every org gets exactly one, so
  -- adding branches later is a feature rather than a migration (TRD 5).
  insert into outlets (org_id, name, is_default) values (new_org, 'Main', true);

  insert into memberships (org_id, user_id, role) values (new_org, new.id, 'owner');

  -- Free until they choose otherwise. Nothing is charged for a card that was
  -- never added.
  insert into subscriptions (org_id, plan, status) values (new_org, 'free', 'active');

  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

-- Recording a rate change, from the same place the rate is written.
--
-- Kept in the database rather than in the application because history that
-- depends on the caller remembering to write it is history with holes in it.
-- Append-only: a rate that was true on a date stays true for that date.
create or replace function log_rate_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A first rate is a change from nothing, and says so with a null `price_from`
  -- rather than pretending the ingredient used to be free.
  if tg_op = 'UPDATE' and new.purchase_price is not distinct from old.purchase_price then
    return new;
  end if;
  if new.purchase_price is null then
    return new;
  end if;

  insert into ingredient_rate_history (ingredient_id, purchase_qty, price_from, price_to, changed_by)
  values (
    new.id,
    new.purchase_qty,
    case when tg_op = 'UPDATE' then old.purchase_price else null end,
    new.purchase_price,
    auth.uid()
  );
  return new;
end $$;

create trigger ingredients_log_rate
after insert or update of purchase_price on ingredients
for each row execute function log_rate_change();

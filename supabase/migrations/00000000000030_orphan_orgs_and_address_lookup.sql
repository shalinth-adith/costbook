-- Two things the auth audit of 2026-09-15 found the database not doing.
--
-- ── An organisation dies with its last member ─────────────────────────────
--
-- Deleting a sign-in cascades to its membership row and stops there: the
-- organisation the signup trigger created for it stays behind, unnamed, with
-- nobody on it. Five of those had accumulated by the time anyone looked —
-- every sign-up test, every account closed by hand in the dashboard, left
-- one. Nothing could ever reach them again (RLS scopes reads by membership),
-- but an admin's book list showed them, and a proxy that picked memberships
-- without care could route somebody into one.
--
-- The rule is small: when a membership goes and it was the last one, the
-- organisation goes with it. Everything under an organisation already
-- cascades (schema.sql), so this is one delete, not a cleanup procedure.
--
-- It runs AFTER DELETE so that `eraseOrg` (lib/erase.ts), which deletes the
-- organisation first and the sign-ins afterwards, is unaffected: by the time
-- its memberships cascade away, the organisation is already gone and the
-- trigger's delete matches nothing.

create or replace function public.drop_org_when_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from memberships where org_id = old.org_id) then
    delete from organizations where id = old.org_id;
  end if;
  return old;
end
$$;

drop trigger if exists org_gone_with_last_member on memberships;
create trigger org_gone_with_last_member
  after delete on memberships
  for each row execute function public.drop_org_when_empty();

-- The ones already orphaned. They are unnamed and unreachable; nothing is
-- lost by removing rows nobody can read.
delete from organizations o
where not exists (select 1 from memberships m where m.org_id = o.id);

-- ── Whether an address has an account, asked with the service key ─────────
--
-- "Send a new code" has no password to give, so it asks the provider for a
-- magic-link code — and for an address with no account, the provider's
-- answer to that is to create one. A public button was making accounts, with
-- organisations, for any address typed at it.
--
-- The fix is to ask first. `auth.users` is not readable through the data API
-- at all, so this is the one place the question can be asked, and it is
-- granted to the service role alone: an answer available to a session would
-- be the address-enumeration hole every screen in this product is written to
-- avoid.

create or replace function public.email_has_account(address text)
returns boolean
language sql
security definer
stable
set search_path = auth, public
as $$
  select exists (
    select 1 from auth.users u where lower(u.email) = lower(trim(address))
  )
$$;

revoke all on function public.email_has_account(text) from public;
revoke all on function public.email_has_account(text) from anon;
revoke all on function public.email_has_account(text) from authenticated;
grant execute on function public.email_has_account(text) to service_role;

comment on function public.email_has_account(text) is
  'Service-role only. Whether an address has a sign-in; used before minting a code so a resend cannot create an account.';

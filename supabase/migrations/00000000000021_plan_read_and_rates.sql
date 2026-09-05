-- Two things, both about a figure being wrong rather than missing.

-- ── Anyone on the book may read which plan it is on ─────────────────────────
--
-- `subscriptions_owner` covered select as well as write, so for a manager the
-- row came back empty and the application read that as "free" — the six-dish
-- cap and no import, on a book somebody had paid for. The bill itself is not
-- here: what an order cost and what the provider called it live in
-- payment_orders, which stays owner-only (A27). This is the tier, which every
-- screen that refuses an action has to know.
drop policy if exists subscriptions_owner on subscriptions;

create policy subscriptions_read on subscriptions
  for select using (org_id in (select auth_org_ids()));
create policy subscriptions_insert on subscriptions
  for insert with check (auth_owns(org_id));
create policy subscriptions_update on subscriptions
  for update using (auth_owns(org_id)) with check (auth_owns(org_id));
create policy subscriptions_delete on subscriptions
  for delete using (auth_owns(org_id));

-- ── A typed rate wide enough to survive being stored ────────────────────────
--
-- Rates are held per base unit, and a base unit is a gram or a millilitre.
-- Salt at 0.5455 a kilo is 0.0005455 a gram, which four decimal places store
-- as 0.0005 — a tenth of the line's real cost, arrived at silently, on a
-- column whose whole purpose is to carry the figure the operator typed.
alter table recipe_components
  alter column rate_override type numeric(20,10);

-- The repeat import: a remembered map, and seven days to change your mind.
--
-- FLOWS 3.3 describes an import that is a monthly rhythm rather than a
-- one-time onboarding event, and names two things it needs. Mapping is
-- remembered, so next month's identical sheet arrives already mapped. And the
-- undo window is seven days rather than a confirm step, "because the user is
-- committing a change to a menu that was already working".
--
-- Almost nothing new is needed. `imports` has existed since migration 1 with
-- `mapping` and `summary` columns and has never had a row written to it; the
-- remembered map is simply the last committed import's `mapping`. What is
-- missing is the link from a rate change back to the import that made it,
-- without which there is nothing to undo.

-- Which import moved this rate, where an import did. Null for the ordinary
-- case of somebody typing a price on the ingredients screen.
--
-- ON DELETE SET NULL, not CASCADE: deleting an import record must never take
-- the price history with it. The history is the record of what the kitchen
-- paid, and it outlives the paperwork that produced it.
alter table ingredient_rate_history
  add column if not exists import_id uuid references imports(id) on delete set null;

comment on column ingredient_rate_history.import_id is
  'The import that wrote this row, so it can be rolled back as one event.';

-- The pack size the OLD price was for.
--
-- `purchase_qty` on a history row has always meant the quantity `price_to`
-- refers to, and nothing recorded the quantity `price_from` referred to. That
-- is invisible until something tries to undo: a sheet moving an ingredient
-- from 1 kg at 40 to a 5 kg sack at 180 records price_from 40 against
-- purchase_qty 5000, and putting 40 back against a 5 kg pack prices it at 8 a
-- kilo. A fifth of the true cost, on a screen that says the rate was restored.
--
-- Null on every row written before this migration, and the undo leaves the
-- pack alone where it is null rather than guessing.
alter table ingredient_rate_history
  add column if not exists qty_from numeric(14,4);

comment on column ingredient_rate_history.qty_from is
  'The pack quantity price_from was for. Null on rows written before migration 24.';

-- Gathering one import's changes, which is the only query that reads it.
create index if not exists rate_history_import
  on ingredient_rate_history (import_id)
  where import_id is not null;

-- Finding an account's last import: for the remembered map, and for the
-- undo offer.
create index if not exists imports_recent
  on imports (org_id, created_at desc);

-- ── Undoing an import ─────────────────────────────────────────────────────
--
-- One statement, because a half-undone import is exactly the failure TRD 7
-- names: partial writes are worse than failed ones, since nothing prompts the
-- operator to look. Every rate this import moved goes back to what it was
-- immediately before, the history rows are removed, and the import is marked.
--
-- WHAT IT DOES NOT DO. Dishes and ingredients the import added stay. This
-- undoes the pricing, not the arrival — which is the thing FLOWS 3.3 is
-- worried about, a supplier's list repricing a menu that was already working.
-- Deleting a fortnight of a chef's edits to dishes that arrived with the sheet
-- would be a far larger and less reversible act than the one being undone.
--
-- A rate that had no previous value goes back to having none. That is the
-- literal meaning of undo for an ingredient this import introduced, and it
-- leaves the ingredient reporting a floor, which the dashboard already ranks
-- as work to do.
create or replace function undo_import(p_import uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  target   imports%rowtype;
  put_back integer;
begin
  select * into target from imports where id = p_import;

  -- RLS has already hidden another account's import, so a miss here is a
  -- genuine miss. PT404: PostgREST reads a PT-prefixed SQLSTATE as the HTTP
  -- status to answer with (see migration 23 for why that matters).
  if target.id is null then
    raise exception 'no_such_import' using errcode = 'PT404';
  end if;

  -- Membership, not ownership: importing is not owner-gated (a manager may
  -- change rates, FLOWS 9), so undoing an import must not be either. Whoever
  -- can make the change can put it back.
  if target.org_id not in (select auth_org_ids()) then
    raise exception 'not_your_import' using errcode = 'PT403';
  end if;

  if target.status <> 'committed' then
    raise exception 'already_undone' using errcode = 'PT409';
  end if;

  if target.created_at < now() - interval '7 days' then
    raise exception 'undo_window_closed' using errcode = 'PT410';
  end if;

  -- Back to the figure that stood before this import touched it. One row per
  -- ingredient per import, because saveBook writes one, but distinct on is
  -- kept so a future batched writer cannot silently restore the wrong one.
  with restore as (
    select distinct on (h.ingredient_id)
      h.ingredient_id, h.price_from, h.qty_from
    from ingredient_rate_history h
    where h.import_id = p_import
    order by h.ingredient_id, h.changed_at asc
  )
  update ingredients i
  set purchase_price = r.price_from,
      -- The pack the old price was for. Left alone when the row predates
      -- migration 24 and cannot say: a price restored against the wrong pack
      -- is a wrong rate presented as a correct one.
      purchase_qty   = coalesce(r.qty_from, i.purchase_qty)
  from restore r
  where i.id = r.ingredient_id;

  get diagnostics put_back = row_count;

  delete from ingredient_rate_history where import_id = p_import;

  update imports set status = 'undone' where id = p_import;

  return put_back;
end
$$;

revoke all on function undo_import(uuid) from public;
grant execute on function undo_import(uuid) to authenticated;

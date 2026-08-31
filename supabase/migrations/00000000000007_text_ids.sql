-- The operator's own things are named, not numbered.
--
-- TRD 5 declares every id uuid. The engine identifies a recipe as `jeera-rice`
-- and an ingredient as `onion-big` — slugs derived from the name — so every
-- insert the importer made failed with "invalid input syntax for type uuid",
-- and because nothing checked the error, an import of 74 recipes reported
-- success and wrote nothing.
--
-- Text is the right identity here, not a workaround. A slug is stable across
-- re-imports of the same sheet, which is exactly how TRD 7's "re-running does
-- not duplicate" works: the second import of Jeera Rice upserts onto the first
-- rather than creating a twin. A generated uuid would make every re-import a
-- fresh set of dishes.
--
-- The system's own ids stay uuid: organisations, outlets, memberships,
-- invitations, subscriptions. Those are not things an operator names.

-- The policies read these columns, so Postgres will not let the type change
-- underneath them. Dropped and put back verbatim below.
drop policy components_all on recipe_components;
drop policy history_read on ingredient_rate_history;
drop policy history_append on ingredient_rate_history;

alter table recipe_components drop constraint recipe_components_ingredient_id_fkey;
alter table recipe_components drop constraint recipe_components_child_recipe_id_fkey;
alter table recipe_components drop constraint recipe_components_recipe_id_fkey;
alter table ingredient_rate_history drop constraint ingredient_rate_history_ingredient_id_fkey;

-- This one compares the two id columns, so it cannot survive one of them
-- changing type before the other. Restored below, unchanged.
alter table recipe_components drop constraint no_self_reference;
alter table recipe_components drop constraint one_target;

alter table recipes          alter column id type text using id::text;
alter table ingredients      alter column id type text using id::text;
alter table recipe_components alter column recipe_id       type text using recipe_id::text;
alter table recipe_components alter column ingredient_id   type text using ingredient_id::text;
alter table recipe_components alter column child_recipe_id type text using child_recipe_id::text;
alter table ingredient_rate_history alter column ingredient_id type text using ingredient_id::text;

-- No default any more: the application supplies the name it derived.
alter table recipes     alter column id drop default;
alter table ingredients alter column id drop default;

alter table recipe_components
  add constraint recipe_components_recipe_id_fkey
    foreign key (recipe_id) references recipes(id) on delete cascade,
  add constraint recipe_components_ingredient_id_fkey
    foreign key (ingredient_id) references ingredients(id) on delete restrict,
  add constraint recipe_components_child_recipe_id_fkey
    foreign key (child_recipe_id) references recipes(id) on delete restrict;

alter table ingredient_rate_history
  add constraint ingredient_rate_history_ingredient_id_fkey
    foreign key (ingredient_id) references ingredients(id) on delete cascade;


alter table recipe_components
  add constraint one_target check (
    (kind = 'ingredient' and ingredient_id is not null and child_recipe_id is null and qty is not null) or
    (kind = 'recipe'     and child_recipe_id is not null and ingredient_id is null and qty is not null) or
    (kind = 'flat'       and ingredient_id is null and child_recipe_id is null
                         and label is not null and line_total is not null)
  ),
  -- The trivial cycle, caught by a check rather than by the trigger.
  add constraint no_self_reference check (child_recipe_id is null or child_recipe_id <> recipe_id);

-- Put the policies back exactly as migration 3 wrote them.
create policy components_all on recipe_components
  for all using (
    recipe_id in (select id from recipes where org_id in (select auth_org_ids()))
  )
  with check (
    recipe_id in (select id from recipes where org_id in (select auth_org_ids()))
  );

create policy history_read on ingredient_rate_history
  for select using (
    ingredient_id in (select id from ingredients where org_id in (select auth_org_ids()))
  );
create policy history_append on ingredient_rate_history
  for insert with check (
    ingredient_id in (select id from ingredients where org_id in (select auth_org_ids()))
  );

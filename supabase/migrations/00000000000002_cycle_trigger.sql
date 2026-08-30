-- Cycle prevention (TRD 6.5).
--
-- This rule exists twice on purpose. core/recipe.ts checks it while the
-- operator is editing, for fast feedback; this trigger is the guarantee at
-- write time. Two implementations of one rule is normally a smell — here the
-- trigger is correctness and the core version is the user experience, and they
-- are tested against the same cases (TRD 2).
--
-- Without it, one bad edit hangs the costing query forever.

create or replace function check_recipe_cycle()
returns trigger
language plpgsql
-- Reads recipe_components regardless of the writer's RLS view. A cycle is a
-- property of the graph, not of who can see it, and a check that only sees
-- half the rows would pass a write that corrupts the whole org's costing.
security definer
set search_path = public, pg_temp
as $$
declare found boolean;
begin
  if new.kind <> 'recipe' then return new; end if;

  -- Walk upward from the recipe being written: who uses it, who uses them.
  -- If the child we are about to add is anywhere in that set, adding it would
  -- close a loop.
  with recursive ancestors as (
    select new.recipe_id as id
    union
    select rc.recipe_id
    from recipe_components rc
    join ancestors a on rc.child_recipe_id = a.id
    where rc.kind = 'recipe'
  )
  select exists (select 1 from ancestors where id = new.child_recipe_id) into found;

  if found then
    -- Surfaced to the operator as plain language by the server action:
    -- "Kuruma already uses this recipe, so it can't be added here."
    -- Never as a database error.
    raise exception 'recipe_cycle: % would reference itself through its components', new.recipe_id
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger recipe_components_no_cycle
before insert or update on recipe_components
for each row execute function check_recipe_cycle();

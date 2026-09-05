-- A recipe save is one transaction.
--
-- It was three statements from the application: upsert the recipe, delete its
-- lines, insert the new lines. If the third was refused (a cycle the trigger
-- caught, a duplicate name, a figure too wide for its column) the dish was
-- left standing with no lines at all. Inside a function the three are one
-- transaction: either all of it lands or none of it does.
--
-- Security invoker, so row-level security applies exactly as it does to the
-- application's own statements. `p_with_meta` false updates only the shape
-- of an existing recipe (name, output, portions, lines) and leaves what the
-- dish already says about itself alone — the cost sheet saves that way and
-- used to null every meta column and rely on a second write to restore them.
create or replace function save_recipes(p_recipes jsonb, p_lines jsonb, p_with_meta boolean default true)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into recipes (
    id, org_id, name, family, output_qty, output_unit, portions, is_sub_recipe,
    category, station, portion_size, selling_price, delivery_price, on_menu, archived,
    notes, method, custom, target_food_cost, wastage_percent, packaging_per_portion,
    accompaniments_per_portion, overhead_per_portion, money_per_plate, rounding,
    labour_minutes, priced_at, kept_at_pricing
  )
  select
    r.id, r.org_id, r.name, r.family, r.output_qty, r.output_unit, r.portions,
    coalesce(r.is_sub_recipe, false),
    r.category, r.station, r.portion_size, r.selling_price, r.delivery_price,
    coalesce(r.on_menu, false), coalesce(r.archived, false),
    r.notes, r.method, coalesce(r.custom, '{}'::jsonb), r.target_food_cost, r.wastage_percent,
    r.packaging_per_portion, r.accompaniments_per_portion, r.overhead_per_portion,
    r.money_per_plate, r.rounding, r.labour_minutes, r.priced_at, r.kept_at_pricing
  from jsonb_populate_recordset(null::recipes, p_recipes) r
  on conflict (id) do update set
    name          = excluded.name,
    family        = excluded.family,
    output_qty    = excluded.output_qty,
    output_unit   = excluded.output_unit,
    portions      = excluded.portions,
    is_sub_recipe = excluded.is_sub_recipe,
    updated_at    = now(),
    category      = case when p_with_meta then excluded.category      else recipes.category      end,
    station       = case when p_with_meta then excluded.station       else recipes.station       end,
    portion_size  = case when p_with_meta then excluded.portion_size  else recipes.portion_size  end,
    selling_price = case when p_with_meta then excluded.selling_price else recipes.selling_price end,
    delivery_price = case when p_with_meta then excluded.delivery_price else recipes.delivery_price end,
    on_menu       = case when p_with_meta then excluded.on_menu       else recipes.on_menu       end,
    archived      = case when p_with_meta then excluded.archived      else recipes.archived      end,
    notes         = case when p_with_meta then excluded.notes         else recipes.notes         end,
    method        = case when p_with_meta then excluded.method        else recipes.method        end,
    custom        = case when p_with_meta then excluded.custom        else recipes.custom        end,
    target_food_cost = case when p_with_meta then excluded.target_food_cost else recipes.target_food_cost end,
    wastage_percent  = case when p_with_meta then excluded.wastage_percent  else recipes.wastage_percent  end,
    packaging_per_portion = case when p_with_meta then excluded.packaging_per_portion else recipes.packaging_per_portion end,
    accompaniments_per_portion = case when p_with_meta then excluded.accompaniments_per_portion else recipes.accompaniments_per_portion end,
    overhead_per_portion = case when p_with_meta then excluded.overhead_per_portion else recipes.overhead_per_portion end,
    money_per_plate  = case when p_with_meta then excluded.money_per_plate  else recipes.money_per_plate  end,
    rounding         = case when p_with_meta then excluded.rounding         else recipes.rounding         end,
    labour_minutes   = case when p_with_meta then excluded.labour_minutes   else recipes.labour_minutes   end,
    priced_at        = case when p_with_meta then excluded.priced_at        else recipes.priced_at        end,
    kept_at_pricing  = case when p_with_meta then excluded.kept_at_pricing  else recipes.kept_at_pricing  end;

  delete from recipe_components
  where recipe_id in (select value->>'id' from jsonb_array_elements(p_recipes));

  insert into recipe_components (
    recipe_id, position, kind, scope, ingredient_id, child_recipe_id,
    label, qty, unit, note, rate_override, line_total
  )
  select
    l.recipe_id, coalesce(l.position, 0), l.kind, coalesce(l.scope, 'batch'),
    l.ingredient_id, l.child_recipe_id, l.label, l.qty, l.unit, l.note,
    l.rate_override, l.line_total
  from jsonb_populate_recordset(null::recipe_components, p_lines) l;
end
$$;

revoke all on function save_recipes(jsonb, jsonb, boolean) from public;
grant execute on function save_recipes(jsonb, jsonb, boolean) to authenticated;

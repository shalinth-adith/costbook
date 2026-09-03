-- How many of each dish sold in a month.
--
-- The one input menu engineering needs and the book never held. A monthly
-- figure per dish, from the till or the aggregator's dashboard, pasted in.
-- With it a dish can be judged by what it sells and what it leaves, which is
-- the whole of Kasavana & Smith (1982) and the single biggest step in the
-- menu-pricing literature. Without it every dish looks the same size.
create table if not exists dish_sales (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  recipe_id  text not null references recipes(id) on delete cascade,
  -- The first day of the month the figure is for.
  period     date not null,
  sold       integer not null check (sold >= 0),
  created_at timestamptz not null default now(),
  unique (recipe_id, period)
);
create index if not exists dish_sales_org_period on dish_sales (org_id, period desc);

alter table dish_sales enable row level security;
create policy dish_sales_all on dish_sales
  for all using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

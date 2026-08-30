-- Costbook — the schema (TRD 5), as the application actually holds it.
--
-- Two deliberate departures from TRD 5 as written, both because the product
-- rule changed after that section was drafted:
--
--   1. `ingredients.purchase_price` is NULLABLE. The TRD has it NOT NULL with a
--      >= 0 check. The governing rule of the product is that a rate nobody
--      entered is null and never zero — zero is reserved for things that are
--      genuinely free, like water. A NOT NULL column would forbid the exact
--      state the importer creates and the whole floor-versus-cost distinction
--      rests on. The check stays; the NOT NULL goes.
--
--   2. The organisation carries the settings the wizard asks for and Settings
--      edits: tax treatment, the charge stack, rounding, wastage, packaging,
--      staleness. TRD 5 predates A22 and A27.
--
-- Everything else follows TRD 5 exactly.

create type member_role      as enum ('owner', 'manager');
create type unit_family      as enum ('mass', 'volume', 'count');
create type component_type   as enum ('ingredient', 'recipe', 'flat');
-- 'batch'   → cost is divided across all portions (the normal case)
-- 'portion' → cost applies once per portion (ghee drizzled on each plate)
create type component_scope  as enum ('batch', 'portion');
-- Whether tax a supplier bills comes back to the operator. Decides which
-- figure they are asked to type as a rate, not how the arithmetic runs.
create type tax_treatment    as enum ('recoverable', 'absorbed');

create table organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  currency_code    char(3) not null default 'INR',
  -- 30 is a conservative default. Asked at setup rather than assumed (A22).
  food_cost_target numeric(5,2) not null default 30.00
    check (food_cost_target > 0 and food_cost_target <= 100),
  -- Null until the wizard's second question is answered. The only field here
  -- with no safe default: either answer is wrong for half of all operators,
  -- and both are wrong by a whole tax rate.
  tax_treatment    tax_treatment,
  -- The ordered stack the guest's bill carries, and what a platform takes out
  -- of the operator's side. Shape is core/charges.ts's Charge[].
  charges          jsonb not null default '[]'::jsonb,
  rounding         text not null default 'next_9',
  wastage_percent  numeric(5,2) not null default 2.00 check (wastage_percent >= 0),
  packaging_per_portion numeric(14,4) not null default 0 check (packaging_per_portion >= 0),
  stale_after_days int not null default 90 check (stale_after_days > 0),
  default_mass_unit   text not null default 'g',
  default_volume_unit text not null default 'ml',
  setup_done       boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Present from day one, hidden in the v1 UI. Every org gets exactly one outlet
-- at signup. Adding branches later is then a feature, not a migration.
create table outlets (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  name       text not null,
  is_default boolean not null default false
);
create index on outlets (org_id);

create table memberships (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role    member_role not null default 'manager',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on memberships (user_id);

create table ingredients (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  name           text not null,
  family         unit_family not null,
  -- Purchase pack: "a 50 kg sack costs 2400". Stored in BASE units.
  purchase_qty   numeric(14,4) not null check (purchase_qty > 0),
  -- NULLABLE on purpose. Null means no rate on file; 0 means genuinely free.
  -- Conflating the two is the bug this whole product exists to avoid.
  purchase_price numeric(14,4) check (purchase_price >= 0),
  purchase_unit  text not null,
  -- 100 = no loss. 80 = a fifth lost to peeling and trimming.
  yield_percent  numeric(5,2) not null default 100
    check (yield_percent > 0 and yield_percent <= 100),
  -- True when Costbook supplied the yield rather than the operator. Drives the
  -- DEFAULT chip beside the figure it produced.
  yield_is_assumed boolean not null default true,
  supplier       text,
  -- When the rate was last given. Staleness is measured from here.
  priced_at      date,
  -- Set when a supplier feed owns the rate and it cannot be typed over.
  locked_by      text,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (org_id, name)
);
create index on ingredients (org_id);

-- Append-only. "The price has always been that" is a thing suppliers say.
create table ingredient_rate_history (
  id             uuid primary key default gen_random_uuid(),
  ingredient_id  uuid not null references ingredients(id) on delete cascade,
  purchase_qty   numeric(14,4) not null,
  -- Null on the row that recorded an ingredient's first rate.
  price_from     numeric(14,4),
  price_to       numeric(14,4) not null,
  changed_by     uuid references auth.users(id),
  changed_at     timestamptz not null default now()
);
create index on ingredient_rate_history (ingredient_id, changed_at desc);

create table recipes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  category      text,
  station       text,
  family        unit_family not null,
  output_qty    numeric(14,4) not null check (output_qty > 0),
  output_unit   text not null,
  -- Null for a pure sub-recipe. A gravy made by the kilo has no cost per
  -- portion, and calling that zero would invent a figure.
  portions      numeric(14,4) check (portions > 0),
  portion_size  text,
  selling_price numeric(14,4) check (selling_price >= 0),
  -- A price of its own on a delivery platform (A26). Null means it is listed
  -- at the counter price, which is the case that usually loses money.
  delivery_price numeric(14,4) check (delivery_price >= 0),
  -- Overrides organizations.food_cost_target for this dish alone.
  target_food_cost numeric(5,2) check (target_food_cost > 0 and target_food_cost <= 100),
  is_sub_recipe boolean not null default false,
  on_menu       boolean not null default false,
  archived      boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, name)
);
create index on recipes (org_id);

create table recipe_components (
  id              uuid primary key default gen_random_uuid(),
  recipe_id       uuid not null references recipes(id) on delete cascade,
  position        int not null default 0,
  kind            component_type not null,
  scope           component_scope not null default 'batch',
  ingredient_id   uuid references ingredients(id) on delete restrict,
  child_recipe_id uuid references recipes(id) on delete restrict,
  label           text,
  qty             numeric(14,4) check (qty > 0),
  unit            text,
  note            text,
  -- Exactly one of these is authoritative; the other is derived (TRD 6.6).
  -- Both null means the line takes the ingredient's own rate.
  rate_override   numeric(14,4) check (rate_override >= 0),
  line_total      numeric(14,4) check (line_total >= 0),
  constraint one_target check (
    (kind = 'ingredient' and ingredient_id is not null and child_recipe_id is null and qty is not null) or
    (kind = 'recipe'     and child_recipe_id is not null and ingredient_id is null and qty is not null) or
    (kind = 'flat'       and ingredient_id is null and child_recipe_id is null
                         and label is not null and line_total is not null)
  ),
  -- The trivial cycle, caught by a check rather than by the trigger.
  constraint no_self_reference check (child_recipe_id is null or child_recipe_id <> recipe_id),
  -- A line cannot be authoritative in two directions at once.
  constraint one_entry_mode check (rate_override is null or line_total is null)
);

create index on recipe_components (recipe_id);
create index on recipe_components (child_recipe_id);
create index on recipe_components (ingredient_id);

create table imports (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  filename   text not null,
  status     text not null default 'pending',
  mapping    jsonb,
  summary    jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on imports (org_id);

create table invitations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  email      text not null,
  role       member_role not null default 'manager',
  invited_by uuid references auth.users(id),
  -- Invitations last 14 days (A32). Past this the link says it lapsed rather
  -- than that anything was refused.
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index on invitations (email);

create table subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null unique references organizations(id) on delete cascade,
  plan                     text not null default 'free',
  status                   text not null default 'active',
  razorpay_subscription_id text,
  current_period_end       timestamptz
);

create trigger recipes_touch before update on recipes
for each row execute function pg_catalog.suppress_redundant_updates_trigger();

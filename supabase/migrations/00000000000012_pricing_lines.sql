-- How each kitchen prices: the last step of the ladder, and the lines a small
-- kitchen leaves out.
--
-- Forty years of menu-pricing research (Kasavana & Smith 1982, Pavesic 1985,
-- Raab & Mayer 2003–2010) and every costing tool on the market come down to
-- one ladder of cost lines with one of three last steps: a food-cost share, a
-- fixed amount left per plate, or a multiplier. None of it is a formula the
-- operator types. No jurisdiction is encoded here: what the guest is charged
-- lives in the charge stack; `prices_include_charges` only says whether the
-- menu price already includes it, which is true in most of the world and
-- false in North America.

alter table organizations
  add column if not exists pricing_method text not null default 'food_share'
    check (pricing_method in ('food_share', 'money_per_plate', 'times_cost')),
  add column if not exists money_per_plate numeric(14,4) not null default 0 check (money_per_plate >= 0),
  add column if not exists price_factor numeric(8,4) not null default 3.3 check (price_factor > 0),
  add column if not exists accompaniments_per_portion numeric(14,4) not null default 0 check (accompaniments_per_portion >= 0),
  add column if not exists labour_rate_per_hour numeric(14,4) not null default 0 check (labour_rate_per_hour >= 0),
  add column if not exists overhead_per_portion numeric(14,4) not null default 0 check (overhead_per_portion >= 0),
  add column if not exists prices_include_charges boolean not null default false;

comment on column organizations.accompaniments_per_portion is
  'What goes on every plate beside the recipe: sambar, chutney, bread and butter. The Q factor of culinary math.';
comment on column organizations.labour_rate_per_hour is
  'One kitchen rate. Minutes are a fact of each dish (recipes.labour_minutes).';
comment on column organizations.overhead_per_portion is
  'Rent, gas and power per plate: one figure worked out from last month, never computed by Costbook.';

-- A dish's own figures. Null follows the account; these used to live only in
-- the cost sheet's state and vanish on reload while the chip said THIS DISH.
alter table recipes
  add column if not exists wastage_percent numeric(5,2) check (wastage_percent >= 0),
  add column if not exists packaging_per_portion numeric(14,4) check (packaging_per_portion >= 0),
  add column if not exists accompaniments_per_portion numeric(14,4) check (accompaniments_per_portion >= 0),
  add column if not exists overhead_per_portion numeric(14,4) check (overhead_per_portion >= 0),
  add column if not exists money_per_plate numeric(14,4) check (money_per_plate >= 0),
  add column if not exists rounding text,
  add column if not exists labour_minutes numeric(10,2) check (labour_minutes >= 0);

comment on column recipes.labour_minutes is
  'Minutes of kitchen time one batch takes. Divided by the portions at the account''s rate.';

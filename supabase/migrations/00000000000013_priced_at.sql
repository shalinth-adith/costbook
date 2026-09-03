-- When a dish was priced, and what it kept then.
--
-- Prime-cost tracking fails because it is checked monthly. Recording what a
-- dish kept on the day its price was set lets the sheet say, every day, how
-- far it has drifted and which rates did it. Stamped whenever a price is set
-- or deliberately kept; never computed after the fact.
alter table recipes
  add column if not exists priced_at date,
  add column if not exists kept_at_pricing numeric(6,2) check (kept_at_pricing >= -1000 and kept_at_pricing <= 100);
comment on column recipes.kept_at_pricing is
  'Of every 100 of net price, what was left after the plate cost on the day the price was set.';

-- The one threshold the owner sets: a rate that moves more than this in a
-- month is worth a line on the dashboard even if no dish crossed target.
alter table organizations
  add column if not exists alert_move_percent numeric(5,2) not null default 10 check (alert_move_percent >= 0);

-- Rate history that can answer A39's questions.
--
-- The table has existed since migration 1 and a trigger has been filling it,
-- but it records only what changed. Two things are missing.
--
-- A source. The trigger fires inside Postgres and cannot know whether a rate
-- arrived from someone typing it, from an imported price list, or from a chef
-- confirming it on the kitchen screen. Every row it wrote said "manual" by
-- omission, so an import of 238 rates looked like 238 mornings of work.
--
-- And a confirmation. A39's tie-breaker reads "days since anyone confirmed
-- it", which is not the same as days since it last changed. A chef who checks
-- the onion price and finds it unchanged has done the work; the trigger
-- returns early and records nothing, so tomorrow the screen asks them again.
--
-- The trigger goes with this migration. Every write already passes through one
-- function in lib/book.ts, and that is the only place the source is knowable —
-- a backstop that cannot tell an import from a morning's work fills the table
-- with rows that answer the wrong question.

drop trigger if exists ingredients_log_rate on ingredients;
drop function if exists log_rate_change();

create type rate_source as enum ('manual', 'import', 'confirmed');

alter table ingredient_rate_history
  add column source rate_source not null default 'manual';

-- A confirmation carries the same figure on both sides. Distinguishing it from
-- a change is what stops "confirmed today" being read as "moved today".
comment on column ingredient_rate_history.source is
  'How the rate arrived. A confirmation has price_from = price_to and is not a movement.';

create index on ingredient_rate_history (ingredient_id, source, changed_at desc);

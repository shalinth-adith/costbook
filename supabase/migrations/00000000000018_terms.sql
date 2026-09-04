-- A paid plan is bought for a stretch of months, once, up front. The row
-- records which stretch, when it began, and what the provider called the
-- payment; current_period_end (from the first migration) is when it ends.
alter table subscriptions
  add column if not exists term text check (term in ('monthly', 'quarter', 'half', 'year')),
  add column if not exists started_at timestamptz,
  add column if not exists provider_reference text;

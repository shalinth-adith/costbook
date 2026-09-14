-- Letters about the plan: what has been posted, so nothing is posted twice.
--
-- Costbook sells a stretch of months, paid once, and nothing renews. That is
-- deliberate (lib/plan.ts) and it has one consequence worth mail: a paying
-- café that is not told its months are ending will lapse without noticing.
-- There is no failed-payment mail to send in a product with no mandate — the
-- reminder IS the renewal path.
--
-- A reminder has no click behind it: it is sent because a date arrived. So
-- something has to remember that it went, or a daily job sends it daily.
-- These three stamps are that memory.

-- The two reminders, per stretch. Cleared when a new stretch is bought, so
-- the next one is reminded about in its turn.
alter table subscriptions
  add column if not exists ending_notice_at timestamptz,
  add column if not exists ended_notice_at  timestamptz;

comment on column subscriptions.ending_notice_at is
  'When "your months are ending" was queued for the current stretch. Cleared on renewal.';
comment on column subscriptions.ended_notice_at is
  'When "your months have ended" was queued for the stretch that just ended.';

-- Money taken and nothing switched on: the one payment failure this product
-- can actually have. The provider retries a delivery several times, and each
-- retry must not queue another apology.
alter table payment_orders
  add column if not exists notified_at timestamptz;

comment on column payment_orders.notified_at is
  'When somebody was told this order needs a human. Stops a retried webhook queueing the same letter again.';

-- Taking your work out of the book.
--
-- Reading has always been free and stays free: six dishes costed properly,
-- every figure open to its working, the prep card on screen. What changes is
-- carrying it away — a printed card taped in a kitchen, a spreadsheet sent to
-- an accountant. On the free tier that is bought once, for a hundred rupees,
-- and it is bought for good.
--
-- FOR GOOD IS THE POINT. The product's own promise is that nothing entered is
-- held hostage, and a pass that expired would make a liar of it. Anyone who
-- has ever paid Costbook anything — a stretch of months, or this pass — keeps
-- the right to take their own work with them, including after a subscription
-- lapses.

-- When taking work out was unlocked, and null while it never has been.
--
-- On the subscription rather than in a second table because it is a property
-- of the account's standing, read on every screen that offers a download, and
-- a join for one timestamp is a join on every one of those screens.
alter table subscriptions
  add column if not exists exports_unlocked_at timestamptz;

comment on column subscriptions.exports_unlocked_at is
  'When this account bought the right to take its work out. Set by any paid order — a stretch or the one-off pass — and never cleared.';

-- The one-off pass is an order like any other.
--
-- `term` has meant "how many months" since migration 20. A pass buys no
-- months, so it needs its own value rather than a month count that would be a
-- lie in every report that sums them. The back office already groups revenue
-- by term, so a pass appears there as itself.
alter table payment_orders
  drop constraint if exists payment_orders_term_check;

alter table payment_orders
  add constraint payment_orders_term_check
  check (term in ('monthly', 'quarter', 'half', 'year', 'export'));

-- What was asked for, before it is paid for.
--
-- The confirmation used to be told which term to activate by the browser, and
-- the provider's signature covers only the order and the payment — so a month
-- could be paid for and a year confirmed. It could also be sent twice, and
-- each confirmation stacked another stretch on the end of the last.
--
-- The order is recorded here when it is opened, with the term and the amount
-- the server chose. The confirmation names only the order; the term comes
-- from this row. Claiming it is one conditional update from 'open' to 'paid',
-- so the second attempt matches nothing and is refused, and payment_id is
-- unique so one payment cannot claim two orders.
create table if not exists payment_orders (
  id          text primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  term        text not null check (term in ('monthly', 'quarter', 'half', 'year')),
  -- In the smallest unit the provider charges in: paise, for rupees.
  amount      integer not null check (amount > 0),
  currency    text not null,
  status      text not null default 'open' check (status in ('open', 'paid')),
  payment_id  text unique,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

create index if not exists payment_orders_org_idx on payment_orders (org_id, created_at desc);

alter table payment_orders enable row level security;

-- A manager cannot see the bill, and cannot open or claim an order (A27).
create policy payment_orders_owner on payment_orders
  for all using (auth_owns(org_id)) with check (auth_owns(org_id));

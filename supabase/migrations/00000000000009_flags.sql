-- A flag: a chef noticing a dish has gone wrong, and telling the owner.
--
-- Not messaging. Not email, not SMS, not a push notification, not a thread.
-- A flag is a small object with a dish attached, and it lives on the one screen
-- the owner already opens. Building a messaging product inside a costing
-- product is how both get worse (A40).
--
-- It is the only signal in this product that does not come from a spreadsheet.

-- ── A named person ──────────────────────────────────────────────────────────
--
-- A40 insists on one: the button reads "Send this to Karthik" and the
-- confirmation reads "Karthik has it". In a café of four people a message to a
-- role is a message to nobody.
--
-- Emails live in auth.users, which RLS does not expose, so a member could only
-- be shown as "Owner" or "Manager". The name is carried here instead, given at
-- signup or by whoever sent the invitation.
alter table memberships add column display_name text;

create table flags (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  recipe_id   text not null references recipes(id) on delete cascade,
  sent_by     uuid references auth.users(id) on delete set null,
  -- Who it was sent to. A flag names a person, and survives them leaving.
  sent_to     uuid references auth.users(id) on delete set null,
  sent_by_name text not null,
  /*
   * One optional line for the thing only a person knows — "mutton went up
   * again on Tuesday". That sentence is the whole reason the feature exists;
   * the figures below attach themselves.
   */
  note        text,
  -- The figures as they stood when it was sent. A chef never retypes a number,
  -- and a flag read next week should say what was true when it was raised.
  cost        numeric(14,4),
  price       numeric(14,4),
  food_cost   numeric(6,2),
  target      numeric(5,2),
  sent_at     timestamptz not null default now(),
  -- Honest about delivery: "he hasn't opened it yet", never a tick implying he
  -- has. Null until the owner actually looks.
  opened_at   timestamptz,
  seen_at     timestamptz
);

create index on flags (org_id, sent_at desc);
create index on flags (recipe_id);

alter table flags enable row level security;

-- Everyone on the book can raise one and read the org's. Only the person it
-- was sent to can mark it seen, which is what makes the receipt honest.
create policy flags_read on flags
  for select using (org_id in (select auth_org_ids()));
create policy flags_raise on flags
  for insert with check (org_id in (select auth_org_ids()));
create policy flags_settle on flags
  for update using (sent_to = auth.uid()) with check (sent_to = auth.uid());

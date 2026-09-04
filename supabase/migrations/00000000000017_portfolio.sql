-- The restaurant's portfolio, asked at setup: where it is and how big it is.
-- Neither prices anything. Country proposes a currency once; team size says
-- how much of the product a kitchen is likely to use.
alter table organizations
  add column if not exists country char(2),
  add column if not exists team_size text check (team_size in ('solo', 'small', 'medium', 'large', 'xl'));

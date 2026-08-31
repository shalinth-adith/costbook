-- Columns the operator's sheet carries that Costbook does not cost.
--
-- PRD 6 promises that unmapped columns are kept, not discarded: "Cost per
-- Item", "Expected SP", a supplier code, a shelf life. Costbook has no opinion
-- about any of them and no business throwing them away — the sheet is the
-- operator's record of how they cost, and an import that silently drops a third
-- of it is an import they cannot check against what they had.
--
-- Stored under the sheet's own heading, verbatim. Shortening "Preparation
-- Method" to "method" on their behalf is how a book stops looking like the one
-- they keep.

alter table recipes add column custom jsonb not null default '{}'::jsonb;
alter table ingredients add column custom jsonb not null default '{}'::jsonb;

comment on column recipes.custom is
  'Columns from the operator''s sheet, under their own headings. Never costed.';

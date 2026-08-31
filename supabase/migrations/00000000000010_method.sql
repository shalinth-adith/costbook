-- The method belongs to the dish, not to the dish's note.
--
-- The import read the sheet's "Preparation Method" column correctly and then
-- had nowhere to put it, so it was written into `notes` — the operator's own
-- note field — and the prep card, having no method to print, printed a fixed
-- five-step podi-idly method on every dish in the book. Palkova cake carried
-- Podi Idly's instructions.
--
-- Separating the two lets the card print what the sheet said and print
-- nothing where the sheet said nothing.

alter table recipes add column if not exists method text;

comment on column recipes.method is
  'The preparation method as the operator wrote it, newlines and their own '
  'numbering intact. Printed on the prep card, never renumbered, never costed.';

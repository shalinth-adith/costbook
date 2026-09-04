-- A default the owner never entered must not move a price.
--
-- A real kitchen's own costing sheet carries no wastage and no packaging on
-- any of its 1,015 lines; its rule is cost divided by 0.2 and nothing else.
-- With 2% and 0.35 a plate as defaults, a 0.46 plate arrived at 0.83 before
-- the owner had typed anything. Zero means "not counted", and the ladder
-- hides a line that is zero. Existing accounts keep what they set.
alter table organizations
  alter column wastage_percent set default 0,
  alter column packaging_per_portion set default 0;

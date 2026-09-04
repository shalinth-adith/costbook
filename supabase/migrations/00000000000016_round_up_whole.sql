-- A price rounds up to the next whole number unless the owner says otherwise.
-- 46.30 becomes 47. The owner's words: "46.30 should give us 47, not 46.30".
alter table organizations alter column rounding set default 'up_whole';

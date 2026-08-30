-- Make a user account deletable.
--
-- TRD 5 declares `changed_by uuid references auth.users(id)` with no ON DELETE
-- clause, which defaults to NO ACTION. Once someone has changed a rate, created
-- an import or sent an invitation, their auth.users row can never be removed:
-- the child row blocks it. That contradicts the promise on the privacy page —
-- "ask us to delete the account and it goes within seven days" — and it is the
-- kind of constraint nobody discovers until the first person asks to leave.
--
-- SET NULL rather than CASCADE, deliberately. The history row must survive the
-- person: it is append-only because a rate that was true on a date stays true
-- for that date, and deleting the operator does not make the onion cheaper.
-- What is lost is the attribution, which is the part that should go.

alter table ingredient_rate_history
  drop constraint ingredient_rate_history_changed_by_fkey,
  add constraint ingredient_rate_history_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;

alter table imports
  drop constraint imports_created_by_fkey,
  add constraint imports_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table invitations
  drop constraint invitations_invited_by_fkey,
  add constraint invitations_invited_by_fkey
    foreign key (invited_by) references auth.users(id) on delete set null;

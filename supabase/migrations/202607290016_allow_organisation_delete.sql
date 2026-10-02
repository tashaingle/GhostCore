-- Allow an organisation to be deleted.
-- The last-owner protection blocked the cascade that removes members when the organisation itself
-- is deleted. During that cascade the organisation row is already gone, so the check is skipped
-- then; removing or demoting the last owner of an organisation that still exists stays blocked.
create or replace function public.protect_last_organisation_owner() returns trigger language plpgsql
set search_path=public as $$ begin
  if old.role='owner' and old.status='active' and
    (tg_op='DELETE' or new.role<>'owner' or new.status<>'active') and
    exists(select 1 from public.organisations where id=old.organisation_id) and
    (select count(*) from public.organisation_members where organisation_id=old.organisation_id and role='owner' and status='active')<=1
  then raise exception 'An organisation must retain at least one active owner'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;

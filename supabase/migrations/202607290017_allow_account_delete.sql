-- Allow user accounts to be deleted.
-- Many columns reference auth.users without an ON DELETE action, so deleting any user who had
-- ever created, changed or been assigned something failed. This rewrites every such foreign key
-- in the public schema, including tables created before these migrations existed:
--   * profiles and organisation memberships are removed with the user (ON DELETE CASCADE);
--   * every other reference is cleared (ON DELETE SET NULL), so shared organisation records and
--     audit history remain, attributed to a deleted user, instead of being destroyed.
-- Primary-key columns cascade because they cannot be null.
do $$
declare
  fk record;
  cascade_it boolean;
begin
  for fk in
    select c.conname, t.relname as tbl, a.attname as col, a.attnotnull as not_null,
      exists (
        select 1 from pg_constraint pk
        where pk.conrelid = c.conrelid and pk.contype = 'p' and a.attnum = any (pk.conkey)
      ) as in_pk
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and n.nspname = 'public'
      and array_length(c.conkey, 1) = 1
      and c.confdeltype in ('a', 'r') -- NO ACTION or RESTRICT
  loop
    cascade_it := fk.in_pk
      or (fk.tbl = 'organisation_members' and fk.col = 'user_id')
      or fk.tbl = 'profiles';
    if not cascade_it and fk.not_null then
      execute format('alter table public.%I alter column %I drop not null', fk.tbl, fk.col);
    end if;
    execute format('alter table public.%I drop constraint %I', fk.tbl, fk.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete %s',
      fk.tbl, fk.conname, fk.col, case when cascade_it then 'cascade' else 'set null' end
    );
  end loop;
end $$;

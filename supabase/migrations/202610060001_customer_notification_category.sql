-- Add a "customer" Action Centre category for review alerts (unanswered low reviews and a
-- falling app rating). The category checks were created inline, so their generated names are
-- looked up rather than assumed.
do $$
declare
  t text;
  c record;
begin
  foreach t in array array['notification_rules', 'notifications'] loop
    for c in
      select conname
      from pg_constraint
      where conrelid = format('public.%I', t)::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%category%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    execute format(
      'alter table public.%I add constraint %I check (category in (%s))',
      t,
      t || '_category_check',
      $list$'background_job','integration','credential','correlation','financial','customer','task','deployment','import','organisation','security','system'$list$
    );
  end loop;
end $$;

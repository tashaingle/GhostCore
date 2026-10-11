-- Monthly goals, such as "£5,000 revenue a month". One goal per measure per organisation;
-- progress is worked out from the connected tools, so only the target is stored.
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  metric text not null check (metric in ('revenue', 'orders')),
  target numeric(14, 2) not null check (target > 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, metric)
);
alter table public.goals enable row level security;

-- Everyone in the organisation sees its goals; owners, admins and managers set them.
drop policy if exists "goals_select" on public.goals;
create policy "goals_select" on public.goals
  for select to authenticated
  using (public.is_organisation_member(organisation_id));
drop policy if exists "goals_manage" on public.goals;
create policy "goals_manage" on public.goals
  for all to authenticated
  using (public.has_organisation_role(organisation_id, array['owner', 'admin', 'manager']))
  with check (public.has_organisation_role(organisation_id, array['owner', 'admin', 'manager']));

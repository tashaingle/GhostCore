create table if not exists public.insights (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  summary text not null,
  severity text not null check (severity in ('info','good','warning','critical')),
  confidence integer not null check (confidence between 0 and 100),
  status text not null default 'active' check (status in ('active','acknowledged','dismissed','resolved')),
  rule_id text not null,
  explanation text not null,
  recommendation text not null,
  metadata jsonb not null default '{}'::jsonb,
  source_event_ids uuid[] not null default '{}',
  fingerprint text not null,
  acknowledged_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, fingerprint)
);
create index if not exists insights_org_status_updated_idx on public.insights(organisation_id,status,updated_at desc);
create index if not exists insights_org_rule_idx on public.insights(organisation_id,rule_id);
alter table public.insights enable row level security;
drop policy if exists "Members can view insights" on public.insights;
create policy "Members can view insights" on public.insights for select to authenticated using (public.is_organisation_member(organisation_id));
drop policy if exists "Members can create insights" on public.insights;
create policy "Members can create insights" on public.insights for insert to authenticated with check (public.is_organisation_member(organisation_id));
drop policy if exists "Members can update insights" on public.insights;
create policy "Members can update insights" on public.insights for update to authenticated using (public.is_organisation_member(organisation_id)) with check (public.is_organisation_member(organisation_id));

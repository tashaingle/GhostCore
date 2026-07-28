create table if not exists public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  provider text not null,
  status text not null check (status in ('started','finished','partial','error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  records_received integer not null default 0,
  events_imported integer not null default 0,
  events_skipped integer not null default 0,
  error_count integer not null default 0,
  rate_limited boolean not null default false,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists integration_logs_org_started_idx on public.integration_logs(organisation_id,started_at desc);
create index if not exists integration_logs_integration_started_idx on public.integration_logs(integration_id,started_at desc);
alter table public.integration_logs enable row level security;
drop policy if exists "Members can view integration logs" on public.integration_logs;
create policy "Members can view integration logs" on public.integration_logs for select to authenticated using (public.is_organisation_member(organisation_id));
drop policy if exists "Members can create integration logs" on public.integration_logs;
create policy "Members can create integration logs" on public.integration_logs for insert to authenticated with check (public.is_organisation_member(organisation_id));
drop policy if exists "Members can update integration logs" on public.integration_logs;
create policy "Members can update integration logs" on public.integration_logs for update to authenticated using (public.is_organisation_member(organisation_id)) with check (public.is_organisation_member(organisation_id));

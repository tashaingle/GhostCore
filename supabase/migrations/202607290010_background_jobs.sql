-- Phase 19: generic, organisation-scoped background jobs.
create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete cascade,
  job_key text not null,
  job_type text not null,
  provider text,
  enabled boolean not null default true,
  schedule_type text not null check(schedule_type in('manual','immediate','recurring','cron','one_time','disabled')),
  schedule_value text,
  timezone text not null default 'UTC',
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  retry_count integer not null default 0,
  max_retries integer not null default 3 check(max_retries between 0 and 10),
  timeout_seconds integer not null default 120 check(timeout_seconds between 10 and 900),
  cancel_requested_at timestamptz,
  configuration jsonb not null default '{}',
  version integer not null default 1 check(version>0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,job_key),
  unique(id,organisation_id)
);
create table if not exists public.background_job_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  job_id uuid not null,
  status text not null check(status in('queued','started','completed','failed','cancelled','skipped','retrying','timed_out')),
  attempt integer not null default 1,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  records_processed integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  error_class text,
  error text,
  retry_at timestamptz,
  worker_id text,
  job_version integer not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(job_id,organisation_id) references public.background_jobs(id,organisation_id) on delete cascade
);
create table if not exists public.background_job_locks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  job_id uuid not null,
  job_key text not null,
  worker_id text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  unique(job_id), unique(organisation_id,job_key),
  foreign key(job_id,organisation_id) references public.background_jobs(id,organisation_id) on delete cascade
);
create index if not exists background_jobs_due_idx on public.background_jobs(enabled,next_run_at) where enabled;
create index if not exists background_jobs_org_type_idx on public.background_jobs(organisation_id,job_type,provider);
create index if not exists background_job_runs_job_started_idx on public.background_job_runs(job_id,created_at desc);
create index if not exists background_job_runs_org_status_idx on public.background_job_runs(organisation_id,status,created_at desc);
create index if not exists background_job_locks_expiry_idx on public.background_job_locks(expires_at);
alter table public.background_jobs enable row level security;
alter table public.background_job_runs enable row level security;
alter table public.background_job_locks enable row level security;
create policy "Tenant read background jobs" on public.background_jobs for select to authenticated using(public.is_organisation_member(organisation_id));
create policy "Admins manage background jobs" on public.background_jobs for all to authenticated
  using(public.has_organisation_role(organisation_id,array['owner','admin']))
  with check(public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Tenant read background job runs" on public.background_job_runs for select to authenticated using(public.is_organisation_member(organisation_id));
create policy "Tenant read background job locks" on public.background_job_locks for select to authenticated using(public.is_organisation_member(organisation_id));
revoke all on public.background_job_runs,public.background_job_locks from authenticated;
grant select on public.background_job_runs,public.background_job_locks to authenticated;
-- Existing connector sync locks remain the single connector-level guard. Service
-- workers may acquire them; interactive users retain the existing role check.
create or replace function public.acquire_integration_sync_lock(target_integration_id uuid,target_organisation_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare acquired uuid;
begin
  if auth.role()<>'service_role' and not public.has_organisation_role(target_organisation_id,array['owner','admin','manager']) then return false; end if;
  update public.integrations set sync_locked_until=now()+interval '10 minutes',last_sync_attempt_at=now()
  where id=target_integration_id and organisation_id=target_organisation_id and(sync_locked_until is null or sync_locked_until<now())
  returning id into acquired;
  return acquired is not null;
end$$;
create or replace function public.release_integration_sync_lock(target_integration_id uuid,target_organisation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='service_role' or public.has_organisation_role(target_organisation_id,array['owner','admin','manager']) then
    update public.integrations set sync_locked_until=null where id=target_integration_id and organisation_id=target_organisation_id;
  end if;
end$$;

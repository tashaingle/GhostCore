-- Phase 17: additive, organisation-scoped deterministic correlations.
create table if not exists public.correlation_rule_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_key text not null,
  enabled boolean not null default true,
  minimum_score integer check(minimum_score between 1 and 200),
  time_window_seconds integer check(time_window_seconds between 60 and 31536000),
  eligible_integration_ids uuid[] not null default '{}',
  manual_field_keys text[] not null default '{}',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,rule_key)
);
create table if not exists public.event_correlations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_key text not null, rule_version integer not null check(rule_version>0),
  source_event_id uuid not null,
  target_event_id uuid not null,
  source_provider text not null, target_provider text not null,
  relationship_type text not null,
  direction text not null check(direction in('upstream','downstream','bidirectional','undirected')),
  score integer not null check(score between 0 and 200),
  strength text not null check(strength in('confirmed','strong','moderate','weak','rejected')),
  occurred_at timestamptz not null, fingerprint text not null,
  first_detected_at timestamptz not null default now(), last_confirmed_at timestamptz not null default now(),
  active boolean not null default true, invalidated_at timestamptz, invalidation_reason text,
  metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,fingerprint), unique(id,organisation_id), check(source_event_id<>target_event_id)
);
create table if not exists public.correlation_evidence (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  correlation_id uuid not null,
  rule_version integer not null check(rule_version>0),
  evidence_type text not null, field_name text not null,
  source_value_hash text not null, target_value_hash text not null,
  comparison_result boolean not null, score_contribution integer not null,
  explanation text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create table if not exists public.correlation_revisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  correlation_id uuid not null,
  rule_version integer not null, reason text not null,
  previous_state jsonb not null, new_state jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.correlation_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  status text not null check(status in('running','completed','partial','failed','cancelled')),
  rule_count integer not null default 0, event_count integer not null default 0,
  candidates_evaluated integer not null default 0, correlations_created integer not null default 0,
  correlations_updated integer not null default 0, correlations_invalidated integer not null default 0,
  duplicates_skipped integer not null default 0, error_count integer not null default 0,
  started_at timestamptz not null default now(), completed_at timestamptz, duration_ms integer,
  cursor text, error text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create unique index if not exists events_id_organisation_uidx on public.events(id,organisation_id);
alter table public.event_correlations add constraint event_correlations_source_org_fkey foreign key(source_event_id,organisation_id) references public.events(id,organisation_id) on delete cascade;
alter table public.event_correlations add constraint event_correlations_target_org_fkey foreign key(target_event_id,organisation_id) references public.events(id,organisation_id) on delete cascade;
alter table public.correlation_evidence add constraint correlation_evidence_parent_org_fkey foreign key(correlation_id,organisation_id) references public.event_correlations(id,organisation_id) on delete cascade;
alter table public.correlation_revisions add constraint correlation_revisions_parent_org_fkey foreign key(correlation_id,organisation_id) references public.event_correlations(id,organisation_id) on delete cascade;
create index if not exists event_correlations_org_active_date_idx on public.event_correlations(organisation_id,active,occurred_at desc);
create index if not exists event_correlations_org_source_idx on public.event_correlations(organisation_id,source_event_id);
create index if not exists event_correlations_org_target_idx on public.event_correlations(organisation_id,target_event_id);
create index if not exists event_correlations_org_rule_idx on public.event_correlations(organisation_id,rule_key,rule_version);
create index if not exists event_correlations_org_type_idx on public.event_correlations(organisation_id,relationship_type,created_at desc);
create index if not exists correlation_evidence_org_correlation_idx on public.correlation_evidence(organisation_id,correlation_id);
create index if not exists correlation_runs_org_started_idx on public.correlation_runs(organisation_id,started_at desc);
create index if not exists correlation_revisions_org_correlation_idx on public.correlation_revisions(organisation_id,correlation_id,created_at desc);
alter table public.correlation_rule_settings enable row level security;
alter table public.event_correlations enable row level security;
alter table public.correlation_evidence enable row level security;
alter table public.correlation_revisions enable row level security;
alter table public.correlation_runs enable row level security;
do $$ declare t text; begin
  foreach t in array array['correlation_rule_settings','event_correlations','correlation_evidence','correlation_revisions','correlation_runs'] loop
    execute format('drop policy if exists "Tenant read %1$s" on public.%1$I',t);
    execute format('create policy "Tenant read %1$s" on public.%1$I for select to authenticated using(public.is_organisation_member(organisation_id))',t);
  end loop;
end $$;
create policy "Admins manage correlation settings" on public.correlation_rule_settings for all to authenticated
  using(public.has_organisation_role(organisation_id,array['owner','admin']))
  with check(public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Operators create correlations" on public.event_correlations for insert to authenticated
  with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Operators update correlations" on public.event_correlations for update to authenticated
  using(public.has_organisation_role(organisation_id,array['owner','admin','manager']))
  with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Operators create correlation evidence" on public.correlation_evidence for insert to authenticated
  with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Operators create correlation revisions" on public.correlation_revisions for insert to authenticated
  with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Operators create correlation runs" on public.correlation_runs for insert to authenticated
  with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Operators update correlation runs" on public.correlation_runs for update to authenticated
  using(public.has_organisation_role(organisation_id,array['owner','admin','manager']))
  with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));

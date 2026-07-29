-- Phase 20: deterministic, organisation-scoped Notification and Action Centre.
create table public.notification_rules(
  id uuid primary key default gen_random_uuid(), organisation_id uuid references public.organisations(id) on delete cascade,
  rule_key text not null, rule_version integer not null check(rule_version>0), name text not null, description text not null,
  category text not null check(category in('background_job','integration','credential','correlation','financial','task','deployment','import','organisation','security','system')),
  default_severity text not null check(default_severity in('info','warning','critical')), enabled boolean not null default true,
  configuration_json jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,rule_key,rule_version)
);
create unique index notification_rules_global_unique on public.notification_rules(rule_key,rule_version) where organisation_id is null;
create table public.notifications(
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  rule_key text not null, rule_version integer not null, fingerprint text not null, lifecycle_generation integer not null default 1,
  category text not null check(category in('background_job','integration','credential','correlation','financial','task','deployment','import','organisation','security','system')),
  severity text not null check(severity in('info','warning','critical')), status text not null default 'open' check(status in('open','acknowledged','snoozed','resolved','dismissed')),
  title text not null, summary text not null, explanation text not null, recommended_action text not null, source_type text not null, source_id text not null,
  assigned_user_id uuid references auth.users(id), acknowledged_by uuid references auth.users(id), acknowledged_at timestamptz,
  snoozed_until timestamptz, resolved_by uuid references auth.users(id), resolved_at timestamptz, dismissed_by uuid references auth.users(id), dismissed_at timestamptz,
  resolution_reason text, dismissal_reason text, first_detected_at timestamptz not null default now(), last_detected_at timestamptz not null default now(),
  occurrence_count integer not null default 1 check(occurrence_count>0), latest_revision_id uuid, metadata_json jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,fingerprint,lifecycle_generation), unique(id,organisation_id)
);
create unique index notifications_one_active_fingerprint on public.notifications(organisation_id,fingerprint) where status in('open','acknowledged','snoozed');
create table public.notification_evidence(
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, notification_id uuid not null,
  evidence_fingerprint text not null, evidence_type text not null, source_table text not null, source_id text not null,
  event_id uuid references public.events(id) on delete set null, correlation_id uuid, job_run_id uuid,
  label text not null, description text not null, observed_value_json jsonb not null default '{}', expected_value_json jsonb,
  occurred_at timestamptz not null, created_at timestamptz not null default now(),
  foreign key(notification_id,organisation_id) references public.notifications(id,organisation_id) on delete cascade,
  unique(notification_id,evidence_fingerprint)
);
create table public.notification_revisions(
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, notification_id uuid not null,
  revision_number integer not null check(revision_number>0), change_type text not null,
  previous_status text, new_status text, previous_severity text, new_severity text,
  actor_user_id uuid references auth.users(id), actor_type text not null check(actor_type in('user','system','service')),
  reason text not null, snapshot_json jsonb not null default '{}', created_at timestamptz not null default now(),
  foreign key(notification_id,organisation_id) references public.notifications(id,organisation_id) on delete cascade,
  unique(notification_id,revision_number)
);
create table public.notification_assignments(
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, notification_id uuid not null,
  assigned_user_id uuid not null references auth.users(id), assigned_by uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(), unassigned_at timestamptz, reason text, created_at timestamptz not null default now(),
  foreign key(notification_id,organisation_id) references public.notifications(id,organisation_id) on delete cascade
);
create table public.notification_preferences(
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade, category text,
  minimum_severity text not null default 'info' check(minimum_severity in('info','warning','critical')),
  in_app_enabled boolean not null default true, email_enabled boolean not null default false, webhook_enabled boolean not null default false,
  assignment_enabled boolean not null default true, digest_mode text not null default 'immediate' check(digest_mode in('immediate','daily','weekly','off')),
  quiet_hours_json jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index notification_preferences_unique on public.notification_preferences(organisation_id,coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(category,'*'));
create table public.notification_runs(
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  trigger_type text not null, status text not null check(status in('running','completed','partial','failed')),
  rules_evaluated integer not null default 0, notifications_created integer not null default 0, notifications_updated integer not null default 0,
  notifications_reopened integer not null default 0, notifications_resolved integer not null default 0, notifications_skipped integer not null default 0,
  error_message text, started_at timestamptz not null default now(), finished_at timestamptz, metadata_json jsonb not null default '{}', created_at timestamptz not null default now()
);
create index notifications_org_status_severity_idx on public.notifications(organisation_id,status,severity,last_detected_at desc);
create index notifications_org_category_idx on public.notifications(organisation_id,category,created_at desc);
create index notifications_org_assigned_idx on public.notifications(organisation_id,assigned_user_id,status);
create index notifications_org_rule_idx on public.notifications(organisation_id,rule_key,rule_version);
create index notifications_org_snooze_idx on public.notifications(organisation_id,snoozed_until) where status='snoozed';
create index notification_evidence_parent_idx on public.notification_evidence(organisation_id,notification_id,occurred_at desc);
create index notification_revisions_parent_idx on public.notification_revisions(organisation_id,notification_id,revision_number desc);
create index notification_assignments_parent_idx on public.notification_assignments(organisation_id,notification_id,assigned_at desc);
create index notification_runs_org_created_idx on public.notification_runs(organisation_id,created_at desc);
do $$ declare t text; begin foreach t in array array['notification_rules','notifications','notification_evidence','notification_revisions','notification_assignments','notification_preferences','notification_runs'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy "Members read notification rules" on public.notification_rules for select to authenticated using(organisation_id is null or public.is_organisation_member(organisation_id));
create policy "Admins manage notification rules" on public.notification_rules for all to authenticated using(organisation_id is not null and public.has_organisation_role(organisation_id,array['owner','admin'])) with check(organisation_id is not null and public.has_organisation_role(organisation_id,array['owner','admin']));
do $$ declare t text; begin foreach t in array array['notifications','notification_evidence','notification_revisions','notification_assignments','notification_preferences','notification_runs'] loop execute format('create policy "Members read %1$s" on public.%1$I for select to authenticated using(public.is_organisation_member(organisation_id))',t); end loop; end $$;
create policy "Admins update notifications" on public.notifications for update to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin'])) with check(public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Managers update notification lifecycle" on public.notifications for update to authenticated using(public.has_organisation_role(organisation_id,array['manager'])) with check(public.has_organisation_role(organisation_id,array['manager']) and status in('open','acknowledged','snoozed','resolved'));
create policy "Members acknowledge assigned notifications" on public.notifications for update to authenticated using(public.has_organisation_role(organisation_id,array['member']) and (assigned_user_id=auth.uid() or status='open')) with check(public.has_organisation_role(organisation_id,array['member']) and ((acknowledged_by=auth.uid() and status='acknowledged') or (assigned_user_id=auth.uid() and status in('acknowledged','snoozed'))));
create policy "Admins manage assignments" on public.notification_assignments for all to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin'])) with check(public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Actors append notification revisions" on public.notification_revisions for insert to authenticated with check(actor_user_id=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin','manager','member']));
create policy "Admins manage preferences" on public.notification_preferences for all to authenticated using((user_id=auth.uid() and public.is_organisation_member(organisation_id)) or public.has_organisation_role(organisation_id,array['owner','admin'])) with check((user_id=auth.uid() and public.is_organisation_member(organisation_id)) or public.has_organisation_role(organisation_id,array['owner','admin']));
revoke update,delete on public.notification_revisions from authenticated;
revoke insert,update,delete on public.notification_evidence,public.notification_runs from authenticated;
revoke update on public.notifications from authenticated;
grant update(status,assigned_user_id,acknowledged_by,acknowledged_at,snoozed_until,resolved_by,resolved_at,dismissed_by,dismissed_at,resolution_reason,dismissal_reason,latest_revision_id,updated_at) on public.notifications to authenticated;

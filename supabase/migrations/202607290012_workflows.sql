-- Phase 21: deterministic workflow and approval engine.
create table public.workflow_definitions(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id) on delete cascade,
 name text not null,description text not null default '',status text not null default 'draft' check(status in('draft','active','disabled','archived')),
 trigger_type text not null,enabled boolean not null default false,current_version integer not null default 1 check(current_version>0),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,organisation_id)
);
create table public.workflow_versions(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,workflow_id uuid not null,version integer not null check(version>0),
 definition_snapshot jsonb not null default '{}',change_reason text not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(workflow_id,organisation_id) references public.workflow_definitions(id,organisation_id) on delete cascade,unique(workflow_id,version),unique(id,organisation_id)
);
create table public.workflow_steps(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,workflow_id uuid not null,workflow_version_id uuid not null,
 step_order integer not null check(step_order>0),step_type text not null check(step_type in('task','approval','condition','delay','background_job','notification','integration_action','webhook','manual_confirmation','complete')),
 name text not null,configuration jsonb not null default '{}',timeout_seconds integer not null default 300 check(timeout_seconds between 10 and 86400),
 max_retries integer not null default 3 check(max_retries between 0 and 10),failure_policy text not null default 'fail' check(failure_policy in('fail','continue','pause')),
 assigned_role text,created_at timestamptz not null default now(),
 foreign key(workflow_id,organisation_id) references public.workflow_definitions(id,organisation_id) on delete cascade,
 foreign key(workflow_version_id,organisation_id) references public.workflow_versions(id,organisation_id) on delete cascade,unique(workflow_version_id,step_order),unique(id,organisation_id)
);
create table public.workflow_runs(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,workflow_id uuid not null,workflow_version_id uuid not null,workflow_version integer not null,
 execution_fingerprint text not null,trigger_type text not null,trigger_source_id text,trigger_payload jsonb not null default '{}',
 status text not null default 'queued' check(status in('queued','running','waiting','paused','completed','failed','cancelled')),
 current_step_order integer,started_at timestamptz,finished_at timestamptz,resume_at timestamptz,retry_count integer not null default 0,
 error text,evidence jsonb not null default '{}',linked_notification_id uuid,linked_correlation_id uuid,linked_job_id uuid,
 created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(workflow_id,organisation_id) references public.workflow_definitions(id,organisation_id),
 foreign key(workflow_version_id,organisation_id) references public.workflow_versions(id,organisation_id),unique(organisation_id,execution_fingerprint),unique(id,organisation_id)
);
create table public.workflow_run_steps(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,run_id uuid not null,step_id uuid not null,step_order integer not null,
 status text not null check(status in('queued','running','waiting','completed','failed','skipped','cancelled')),
 attempt integer not null default 1,started_at timestamptz,finished_at timestamptz,resume_at timestamptz,duration_ms integer,error text,
 input_json jsonb not null default '{}',output_json jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(run_id,organisation_id) references public.workflow_runs(id,organisation_id) on delete cascade,
 foreign key(step_id,organisation_id) references public.workflow_steps(id,organisation_id),unique(run_id,step_id,attempt)
);
create table public.workflow_logs(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,run_id uuid not null,run_step_id uuid,
 level text not null check(level in('info','warning','error')),event_type text not null,message text not null,metadata jsonb not null default '{}',
 actor_type text not null check(actor_type in('user','system','service')),actor_user_id uuid references auth.users(id),created_at timestamptz not null default now(),
 foreign key(run_id,organisation_id) references public.workflow_runs(id,organisation_id) on delete cascade
);
create table public.workflow_templates(
 id uuid primary key default gen_random_uuid(),organisation_id uuid references public.organisations(id) on delete cascade,
 template_key text not null,name text not null,description text not null,trigger_type text not null,definition_json jsonb not null,enabled boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index workflow_templates_global_key on public.workflow_templates(template_key) where organisation_id is null;
create unique index workflow_templates_org_key on public.workflow_templates(organisation_id,template_key) where organisation_id is not null;
create table public.workflow_approvals(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,run_id uuid not null,run_step_id uuid not null,
 status text not null default 'pending' check(status in('pending','approved','rejected','expired','cancelled')),
 approver_user_id uuid references auth.users(id),approver_role text,due_at timestamptz,decision_comment text,decided_by uuid references auth.users(id),decided_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(run_id,organisation_id) references public.workflow_runs(id,organisation_id) on delete cascade,unique(run_step_id)
);
create table public.workflow_assignments(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,run_id uuid not null,run_step_id uuid not null,
 assigned_user_id uuid references auth.users(id),assigned_role text,status text not null default 'pending' check(status in('pending','completed','cancelled')),
 due_at timestamptz,completed_by uuid references auth.users(id),completed_at timestamptz,notes text,created_at timestamptz not null default now(),
 foreign key(run_id,organisation_id) references public.workflow_runs(id,organisation_id) on delete cascade,unique(run_step_id)
);
create table public.workflow_trigger_history(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,workflow_id uuid not null,trigger_type text not null,source_id text,
 execution_fingerprint text not null,run_id uuid,status text not null,received_at timestamptz not null default now(),payload_summary jsonb not null default '{}',
 foreign key(workflow_id,organisation_id) references public.workflow_definitions(id,organisation_id),unique(organisation_id,execution_fingerprint)
);
create table public.workflow_events(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,workflow_id uuid not null,workflow_version integer not null,
 event_type text not null,actor_type text not null,actor_user_id uuid references auth.users(id),reason text not null,snapshot jsonb not null default '{}',created_at timestamptz not null default now(),
 foreign key(workflow_id,organisation_id) references public.workflow_definitions(id,organisation_id) on delete cascade
);
create index workflow_definitions_org_status_idx on public.workflow_definitions(organisation_id,status,updated_at desc);
create index workflow_runs_org_status_idx on public.workflow_runs(organisation_id,status,created_at desc);
create index workflow_runs_due_idx on public.workflow_runs(status,resume_at) where status in('queued','waiting');
create index workflow_run_steps_run_idx on public.workflow_run_steps(organisation_id,run_id,step_order,attempt);
create index workflow_logs_run_idx on public.workflow_logs(organisation_id,run_id,created_at);
create index workflow_approvals_inbox_idx on public.workflow_approvals(organisation_id,status,approver_user_id,due_at);
create index workflow_assignments_user_idx on public.workflow_assignments(organisation_id,assigned_user_id,status);
create index workflow_trigger_history_source_idx on public.workflow_trigger_history(organisation_id,trigger_type,source_id);
create index workflow_events_definition_idx on public.workflow_events(organisation_id,workflow_id,created_at desc);
do $$ declare t text;begin foreach t in array array['workflow_definitions','workflow_versions','workflow_steps','workflow_runs','workflow_run_steps','workflow_logs','workflow_templates','workflow_approvals','workflow_assignments','workflow_trigger_history','workflow_events'] loop execute format('alter table public.%I enable row level security',t);end loop;end$$;
do $$ declare t text;begin foreach t in array array['workflow_definitions','workflow_versions','workflow_steps','workflow_runs','workflow_run_steps','workflow_logs','workflow_approvals','workflow_assignments','workflow_trigger_history','workflow_events'] loop execute format('create policy "Members read %1$s" on public.%1$I for select to authenticated using(public.is_organisation_member(organisation_id))',t);end loop;end$$;
create policy "Members read workflow templates" on public.workflow_templates for select to authenticated using(organisation_id is null or public.is_organisation_member(organisation_id));
create policy "Admins manage workflow definitions" on public.workflow_definitions for all to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin'])) with check(public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Admins create workflow versions" on public.workflow_versions for insert to authenticated with check(public.has_organisation_role(organisation_id,array['owner','admin']) and created_by=auth.uid());
create policy "Admins create workflow steps" on public.workflow_steps for insert to authenticated with check(public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Operators create workflow runs" on public.workflow_runs for insert to authenticated with check(created_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Operators update workflow runs" on public.workflow_runs for update to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin','manager'])) with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Approvers decide assigned approvals" on public.workflow_approvals for update to authenticated using(status='pending' and (approver_user_id=auth.uid() or (approver_role is not null and public.has_organisation_role(organisation_id,array[approver_role])))) with check(decided_by=auth.uid() and status in('approved','rejected'));
create policy "Admins manage workflow templates" on public.workflow_templates for all to authenticated using(organisation_id is not null and public.has_organisation_role(organisation_id,array['owner','admin'])) with check(organisation_id is not null and public.has_organisation_role(organisation_id,array['owner','admin']));
revoke update,delete on public.workflow_versions,public.workflow_steps,public.workflow_logs,public.workflow_trigger_history,public.workflow_events from authenticated;

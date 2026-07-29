-- Phase 18: organisation-owned command-centre layouts.
create table if not exists public.command_centre_views (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  name text not null default 'Default' check(length(name) between 1 and 80),
  layout jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,name)
);
create index if not exists command_centre_views_org_updated_idx on public.command_centre_views(organisation_id,updated_at desc);
alter table public.command_centre_views enable row level security;
create policy "Tenant read command centre views" on public.command_centre_views for select to authenticated
  using(public.is_organisation_member(organisation_id));
create policy "Admins create command centre views" on public.command_centre_views for insert to authenticated
  with check(created_by=auth.uid() and updated_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Admins update command centre views" on public.command_centre_views for update to authenticated
  using(public.has_organisation_role(organisation_id,array['owner','admin']))
  with check(updated_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Admins delete command centre views" on public.command_centre_views for delete to authenticated
  using(public.has_organisation_role(organisation_id,array['owner','admin']));

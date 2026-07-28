-- Phase 6: multi-organisation preferences, settings, roles and invitations.
alter table public.organisations add column if not exists logo_url text;
alter table public.organisations add column if not exists website text;
alter table public.organisations add column if not exists industry text;
alter table public.organisations add column if not exists timezone text not null default 'UTC';
alter table public.organisations add column if not exists default_currency text not null default 'GBP';
alter table public.profiles add column if not exists active_organisation_id uuid references public.organisations(id) on delete set null;

do $$ declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid='public.organisation_members'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop execute format('alter table public.organisation_members drop constraint %I',constraint_name); end loop;
end $$;
alter table public.organisation_members add constraint organisation_members_role_check
  check (role in ('owner','admin','manager','member','viewer'));
alter table public.organisation_members add column if not exists status text not null default 'active'
  check (status in ('active','suspended'));
create unique index if not exists organisation_members_org_user_uidx
  on public.organisation_members(organisation_id,user_id);

create table if not exists public.organisation_invitations(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin','manager','member','viewer')),
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists organisation_invitations_pending_email_uidx
  on public.organisation_invitations(organisation_id,lower(email)) where status='pending';
create index if not exists organisation_invitations_org_created_idx
  on public.organisation_invitations(organisation_id,created_at desc);

alter table public.organisation_invitations enable row level security;
alter table public.profiles enable row level security;
drop policy if exists "Managers can view invitations" on public.organisation_invitations;
create policy "Managers can view invitations" on public.organisation_invitations for select to authenticated
using(exists(select 1 from public.organisation_members m where m.organisation_id=organisation_invitations.organisation_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')));
drop policy if exists "Managers can create invitations" on public.organisation_invitations;
create policy "Managers can create invitations" on public.organisation_invitations for insert to authenticated
with check(invited_by=auth.uid() and exists(select 1 from public.organisation_members m where m.organisation_id=organisation_invitations.organisation_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')));
drop policy if exists "Managers can update invitations" on public.organisation_invitations;
create policy "Managers can update invitations" on public.organisation_invitations for update to authenticated
using(exists(select 1 from public.organisation_members m where m.organisation_id=organisation_invitations.organisation_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin')));

create or replace function public.accept_organisation_invitation(invitation_token_hash text) returns uuid
language plpgsql security definer set search_path=public
as $$ declare invitation public.organisation_invitations; current_email text; begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select lower(email) into current_email from auth.users where id=auth.uid();
  update public.organisation_invitations set status='expired',updated_at=now()
    where token_hash=invitation_token_hash and status='pending' and expires_at<=now();
  select * into invitation from public.organisation_invitations
    where token_hash=invitation_token_hash and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Invitation is invalid or expired'; end if;
  if lower(invitation.email)<>current_email then raise exception 'Invitation belongs to another email address'; end if;
  insert into public.organisation_members(organisation_id,user_id,role,status)
    values(invitation.organisation_id,auth.uid(),invitation.role,'active')
    on conflict(organisation_id,user_id) do nothing;
  update public.organisation_invitations set status='accepted',accepted_at=now(),updated_at=now() where id=invitation.id;
  update public.profiles set active_organisation_id=invitation.organisation_id,updated_at=now() where id=auth.uid();
  return invitation.organisation_id;
end $$;
revoke all on function public.accept_organisation_invitation(text) from public;
grant execute on function public.accept_organisation_invitation(text) to authenticated;

-- Enforce active membership in the common helper used by organisation-scoped policies.
create or replace function public.is_organisation_member(target_organisation_id uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organisation_members where organisation_id=target_organisation_id and user_id=auth.uid() and status='active') $$;
revoke all on function public.is_organisation_member(uuid) from public;
grant execute on function public.is_organisation_member(uuid) to authenticated;

do $$ declare table_name text; policy_name text; begin
  foreach table_name in array array['organisations','organisation_members','profiles'] loop
    for policy_name in select policyname from pg_policies where schemaname='public' and tablename=table_name
    loop execute format('drop policy %I on public.%I',policy_name,table_name); end loop;
  end loop;
end $$;
create policy "Organisation members can view teammate profiles" on public.profiles for select to authenticated
using(id=auth.uid() or exists(select 1 from public.organisation_members mine join public.organisation_members theirs on theirs.organisation_id=mine.organisation_id where mine.user_id=auth.uid() and mine.status='active' and theirs.user_id=profiles.id and theirs.status='active'));
create policy "Users can create own profile" on public.profiles for insert to authenticated with check(id=auth.uid());
create policy "Users can update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

create or replace function public.has_organisation_role(target_organisation_id uuid,allowed_roles text[]) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organisation_members where organisation_id=target_organisation_id and user_id=auth.uid() and status='active' and role=any(allowed_roles)) $$;
revoke all on function public.has_organisation_role(uuid,text[]) from public;
grant execute on function public.has_organisation_role(uuid,text[]) to authenticated;
create or replace function public.is_email_organisation_member(target_organisation_id uuid,target_email text) returns boolean
language sql stable security definer set search_path=public
as $$ select public.has_organisation_role(target_organisation_id,array['owner','admin']) and exists(select 1 from public.organisation_members m join auth.users u on u.id=m.user_id where m.organisation_id=target_organisation_id and lower(u.email)=lower(target_email) and m.status='active') $$;
revoke all on function public.is_email_organisation_member(uuid,text) from public;
grant execute on function public.is_email_organisation_member(uuid,text) to authenticated;
create policy "Members can view organisations" on public.organisations for select to authenticated using(public.is_organisation_member(id));
create policy "Admins can update organisations" on public.organisations for update to authenticated using(public.has_organisation_role(id,array['owner','admin'])) with check(public.has_organisation_role(id,array['owner','admin']));
create policy "Members can view memberships" on public.organisation_members for select to authenticated using(public.is_organisation_member(organisation_id));
create policy "Admins can invite memberships" on public.organisation_members for insert to authenticated with check(
  public.has_organisation_role(organisation_id,array['owner']) or
  (public.has_organisation_role(organisation_id,array['admin']) and role in ('manager','member','viewer'))
);
create policy "Admins can update memberships" on public.organisation_members for update to authenticated using(
  public.has_organisation_role(organisation_id,array['owner']) or
  (public.has_organisation_role(organisation_id,array['admin']) and role in ('manager','member','viewer'))
) with check(
  public.has_organisation_role(organisation_id,array['owner']) or
  (public.has_organisation_role(organisation_id,array['admin']) and role in ('manager','member','viewer'))
);
create policy "Admins can delete memberships" on public.organisation_members for delete to authenticated using(
  public.has_organisation_role(organisation_id,array['owner']) or
  (public.has_organisation_role(organisation_id,array['admin']) and role in ('manager','member','viewer'))
);

create or replace function public.protect_last_organisation_owner() returns trigger language plpgsql
set search_path=public as $$ begin
  if old.role='owner' and old.status='active' and
    (tg_op='DELETE' or new.role<>'owner' or new.status<>'active') and
    (select count(*) from public.organisation_members where organisation_id=old.organisation_id and role='owner' and status='active')<=1
  then raise exception 'An organisation must retain at least one active owner'; end if;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists protect_last_organisation_owner_trigger on public.organisation_members;
create trigger protect_last_organisation_owner_trigger before update or delete on public.organisation_members for each row execute function public.protect_last_organisation_owner();

-- Replace business-data policies with one explicit tenant boundary per operation.
do $$ declare table_name text; policy_name text; begin
  foreach table_name in array array['integrations','events','integration_logs','insights'] loop
    for policy_name in select policyname from pg_policies where schemaname='public' and tablename=table_name
    loop execute format('drop policy %I on public.%I',policy_name,table_name); end loop;
  end loop;
end $$;
create policy "Tenant read integrations" on public.integrations for select to authenticated using(public.is_organisation_member(organisation_id));
create policy "Tenant create integrations" on public.integrations for insert to authenticated with check(public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Tenant update integrations" on public.integrations for update to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin','manager'])) with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Tenant delete integrations" on public.integrations for delete to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Tenant read events" on public.events for select to authenticated using(public.is_organisation_member(organisation_id));
create policy "Tenant create events" on public.events for insert to authenticated with check(public.has_organisation_role(organisation_id,array['owner','admin','manager','member']));
create policy "Tenant read integration logs" on public.integration_logs for select to authenticated using(public.is_organisation_member(organisation_id));
create policy "Tenant create integration logs" on public.integration_logs for insert to authenticated with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Tenant update integration logs" on public.integration_logs for update to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin','manager'])) with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Tenant read insights" on public.insights for select to authenticated using(public.is_organisation_member(organisation_id));
create policy "Tenant create insights" on public.insights for insert to authenticated with check(public.has_organisation_role(organisation_id,array['owner','admin','manager','member']));
create policy "Tenant update insights" on public.insights for update to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin','manager','member'])) with check(public.has_organisation_role(organisation_id,array['owner','admin','manager','member']));

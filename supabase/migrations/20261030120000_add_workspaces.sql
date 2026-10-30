-- Workspaces group businesses (organisations), e.g. an agency's clients apart from personal
-- businesses. Access is still decided per business by organisation_members; a workspace is
-- visible to its creator and to anyone who belongs to one of its businesses.
create table if not exists public.workspaces(
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspaces_created_by_idx on public.workspaces(created_by, created_at);

alter table public.organisations add column if not exists workspace_id uuid
  references public.workspaces(id) on delete restrict;
create index if not exists organisations_workspace_idx on public.organisations(workspace_id);

-- Backfill: one "Work" workspace per creator, and a "Personal" one for the businesses that were
-- hidden from the working list by name (Tash, Rabbit Care, Unhinged Clothing).
do $$ declare creator uuid; work_id uuid; personal_id uuid; begin
  -- Work is made first: it's each person's default workspace for new businesses.
  for creator in select distinct created_by from public.organisations where workspace_id is null loop
    if exists(select 1 from public.organisations where created_by=creator and workspace_id is null
              and lower(trim(name)) not in ('tash','rabbit care','unhinged clothing')) then
      insert into public.workspaces(name,created_by) values('Work',creator) returning id into work_id;
      update public.organisations set workspace_id=work_id
        where created_by=creator and workspace_id is null
          and lower(trim(name)) not in ('tash','rabbit care','unhinged clothing');
    end if;
    if exists(select 1 from public.organisations where created_by=creator and workspace_id is null) then
      insert into public.workspaces(name,created_by,created_at) values('Personal',creator,now()+interval '1 second')
        returning id into personal_id;
      update public.organisations set workspace_id=personal_id where created_by=creator and workspace_id is null;
    end if;
  end loop;
end $$;
alter table public.organisations alter column workspace_id set not null;

create or replace function public.can_view_workspace(target_workspace_id uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.workspaces w where w.id=target_workspace_id and w.created_by=auth.uid())
  or exists(select 1 from public.organisations o join public.organisation_members m on m.organisation_id=o.id
            where o.workspace_id=target_workspace_id and m.user_id=auth.uid() and m.status='active') $$;
revoke all on function public.can_view_workspace(uuid) from public;
grant execute on function public.can_view_workspace(uuid) to authenticated;

-- Creators, and owners or admins of any business in it, can add businesses and rename it.
create or replace function public.can_manage_workspace(target_workspace_id uuid) returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.workspaces w where w.id=target_workspace_id and w.created_by=auth.uid())
  or exists(select 1 from public.organisations o join public.organisation_members m on m.organisation_id=o.id
            where o.workspace_id=target_workspace_id and m.user_id=auth.uid() and m.status='active'
              and m.role in ('owner','admin')) $$;
revoke all on function public.can_manage_workspace(uuid) from public;
grant execute on function public.can_manage_workspace(uuid) to authenticated;

alter table public.workspaces enable row level security;
drop policy if exists "Members can view workspaces" on public.workspaces;
create policy "Members can view workspaces" on public.workspaces for select to authenticated
  using(public.can_view_workspace(id));
drop policy if exists "Users can create workspaces" on public.workspaces;
create policy "Users can create workspaces" on public.workspaces for insert to authenticated
  with check(created_by=auth.uid());
drop policy if exists "Managers can rename workspaces" on public.workspaces;
create policy "Managers can rename workspaces" on public.workspaces for update to authenticated
  using(public.can_manage_workspace(id)) with check(public.can_manage_workspace(id));
drop policy if exists "Creators can delete empty workspaces" on public.workspaces;
create policy "Creators can delete empty workspaces" on public.workspaces for delete to authenticated
  using(created_by=auth.uid() and not exists(select 1 from public.organisations o where o.workspace_id=workspaces.id));

-- A business can only be put in a workspace its user may manage. Service-role calls are trusted.
create or replace function public.guard_organisation_workspace() returns trigger language plpgsql
set search_path=public as $$ begin
  if auth.uid() is null then return new; end if;
  if tg_op='UPDATE' and new.workspace_id is not distinct from old.workspace_id then return new; end if;
  if not public.can_manage_workspace(new.workspace_id) then
    raise exception 'You can''t add businesses to that workspace';
  end if;
  return new;
end $$;
drop trigger if exists guard_organisation_workspace_trigger on public.organisations;
create trigger guard_organisation_workspace_trigger before insert or update of workspace_id
  on public.organisations for each row execute function public.guard_organisation_workspace();

-- Creates a business inside a workspace (the caller's first one when none is given, making a
-- "Work" workspace for brand-new users) and adds everyone already in that workspace to it.
drop function if exists public.create_organisation_with_owner(text,text);
create or replace function public.create_organisation_with_owner(
  organisation_name text,
  organisation_slug text,
  target_workspace_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  chosen_workspace_id uuid := target_workspace_id;
  new_organisation_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if length(trim(organisation_name)) < 2 or length(trim(organisation_name)) > 100 then raise exception 'Invalid organisation name'; end if;
  if organisation_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'Invalid organisation slug'; end if;
  if chosen_workspace_id is null then
    select id into chosen_workspace_id from public.workspaces
      where created_by=current_user_id order by created_at limit 1;
    if chosen_workspace_id is null then
      insert into public.workspaces(name,created_by) values('Work',current_user_id)
        returning id into chosen_workspace_id;
    end if;
  elsif not public.can_manage_workspace(chosen_workspace_id) then
    raise exception 'You can''t add businesses to that workspace';
  end if;
  insert into public.organisations (name, slug, created_by, workspace_id)
    values (trim(organisation_name), organisation_slug, current_user_id, chosen_workspace_id)
    returning id into new_organisation_id;
  insert into public.organisation_members (organisation_id, user_id, role)
    values (new_organisation_id, current_user_id, 'owner');
  -- Everyone else in the workspace joins with their highest role there; owners join as admins.
  insert into public.organisation_members (organisation_id, user_id, role)
  select new_organisation_id, ranked.user_id,
    (array['viewer','member','manager','admin','admin'])[ranked.rank]
  from (
    select m.user_id, max(array_position(array['viewer','member','manager','admin','owner'], m.role)) as rank
    from public.organisation_members m join public.organisations o on o.id=m.organisation_id
    where o.workspace_id=chosen_workspace_id and o.id<>new_organisation_id
      and m.status='active' and m.user_id<>current_user_id
    group by m.user_id
  ) ranked
  on conflict (organisation_id,user_id) do nothing;
  return new_organisation_id;
end;
$$;
revoke all on function public.create_organisation_with_owner(text,text,uuid) from public;
grant execute on function public.create_organisation_with_owner(text,text,uuid) to authenticated;

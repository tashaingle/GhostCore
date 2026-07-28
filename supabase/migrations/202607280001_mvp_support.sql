-- The five core tables already exist remotely. This additive migration preserves data.
create unique index if not exists events_organisation_source_external_id_uidx
  on public.events (organisation_id, source, external_id)
  where external_id is not null;

create or replace function public.create_organisation_with_owner(
  organisation_name text,
  organisation_slug text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  new_organisation_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if length(trim(organisation_name)) < 2 or length(trim(organisation_name)) > 100 then raise exception 'Invalid organisation name'; end if;
  if organisation_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then raise exception 'Invalid organisation slug'; end if;
  insert into public.organisations (name, slug, created_by)
    values (trim(organisation_name), organisation_slug, current_user_id)
    returning id into new_organisation_id;
  insert into public.organisation_members (organisation_id, user_id, role)
    values (new_organisation_id, current_user_id, 'owner');
  return new_organisation_id;
end;
$$;
revoke all on function public.create_organisation_with_owner(text,text) from public;
grant execute on function public.create_organisation_with_owner(text,text) to authenticated;

-- RLS remains enabled and the function only creates an organisation for auth.uid().
alter table public.organisations enable row level security;
alter table public.organisation_members enable row level security;
alter table public.integrations enable row level security;
alter table public.events enable row level security;

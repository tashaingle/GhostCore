create table public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  name text not null check (char_length(name) between 1 and 160),
  source text not null check (char_length(source) between 1 and 160),
  platform text not null default 'unknown' check (platform in ('ios', 'android', 'other', 'unknown')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index email_contacts_organisation_email_idx
  on public.email_contacts (organisation_id, lower(email));
create index email_contacts_organisation_created_idx
  on public.email_contacts (organisation_id, created_at desc);

alter table public.email_contacts enable row level security;

create policy "Members read email contacts" on public.email_contacts
  for select to authenticated
  using (public.is_organisation_member(organisation_id));

create policy "Members add email contacts" on public.email_contacts
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_organisation_member(organisation_id)
  );

grant select, insert on table public.email_contacts to authenticated;
grant select, insert, update, delete on table public.email_contacts to service_role;

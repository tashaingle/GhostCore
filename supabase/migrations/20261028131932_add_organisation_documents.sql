create table public.organisation_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null unique,
  content_type text not null check (char_length(content_type) between 1 and 150),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index organisation_documents_org_created_idx
  on public.organisation_documents (organisation_id, created_at desc);

alter table public.organisation_documents enable row level security;

create policy "Members read organisation documents"
  on public.organisation_documents for select to authenticated
  using (public.is_organisation_member(organisation_id));

create policy "Members upload organisation documents"
  on public.organisation_documents for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and public.is_organisation_member(organisation_id)
  );

create policy "Managers delete organisation documents"
  on public.organisation_documents for delete to authenticated
  using (public.has_organisation_role(organisation_id, array['owner','admin','manager']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organisation-documents',
  'organisation-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/zip'
  ]
)
on conflict (id) do nothing;

create policy "Members upload organisation document files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'organisation-documents'
    and public.is_organisation_member(
      case
        when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then ((storage.foldername(name))[1])::uuid
        else null
      end
    )
  );

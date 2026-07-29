-- Phase 14: organisation-scoped manual evidence, revisions, fields and CSV imports.
create table public.manual_records(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 integration_id uuid references public.integrations(id) on delete set null, record_type text not null, title text not null,
 description text, occurred_at timestamptz not null, amount numeric(20,6), currency text, status text not null default 'recorded',
 category text not null default 'other', tags text[] not null default '{}', external_reference text, notes text,
 customer_name text, supplier text, campaign text, location text, owner_name text,
 fingerprint text not null, revision integer not null default 1, archived_at timestamptz,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(record_type in ('revenue','expense','lead','opportunity','customer','contract','quote','refund','stock_adjustment','kpi_snapshot','marketing_spend','offline_sale','phone_enquiry','event_attendance','donation','custom')),
 check(status in ('draft','recorded','open','won','lost','paid','unpaid','refunded','cancelled','completed')),
 check(category in ('marketing','sales','finance','customer','operations','website','development','communication','calendar','security','other')),
 check(currency is null or currency ~ '^[A-Z]{3}$')
);
create unique index manual_records_org_fingerprint_uidx on public.manual_records(organisation_id,fingerprint) where archived_at is null;
create index manual_records_search_idx on public.manual_records(organisation_id,occurred_at desc,record_type,status);
create index manual_records_reference_idx on public.manual_records(organisation_id,external_reference) where external_reference is not null;

create table public.manual_record_revisions(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 record_id uuid not null references public.manual_records(id) on delete cascade, revision integer not null,
 operation text not null check(operation in ('created','updated','archived')), old_values jsonb not null default '{}',
 new_values jsonb not null default '{}', changed_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique(record_id,revision)
);
create index manual_revisions_org_record_idx on public.manual_record_revisions(organisation_id,record_id,revision desc);

create table public.manual_custom_fields(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 name text not null, field_key text not null, field_type text not null check(field_type in ('text','number','currency','date','checkbox','dropdown')),
 required boolean not null default false, options jsonb not null default '[]', active boolean not null default true,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organisation_id,field_key)
);
create table public.manual_custom_values(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 record_id uuid not null references public.manual_records(id) on delete cascade, field_id uuid not null references public.manual_custom_fields(id) on delete cascade,
 value jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(record_id,field_id)
);

create table public.manual_attachments(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 record_id uuid not null references public.manual_records(id) on delete cascade, storage_path text not null, filename text not null,
 mime_type text not null, byte_size integer not null check(byte_size between 1 and 10485760), uploaded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), unique(record_id,storage_path),
 check(mime_type in ('application/pdf','image/jpeg','image/png','text/csv','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
);
create table public.manual_imports(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 integration_id uuid references public.integrations(id) on delete set null, filename text not null, uploaded_by uuid not null references auth.users(id),
 row_count integer not null, successful integer not null, failed integer not null, duplicates integer not null, duration_ms integer not null,
 mapping jsonb not null default '{}', errors jsonb not null default '[]', created_at timestamptz not null default now()
);
create index manual_imports_org_created_idx on public.manual_imports(organisation_id,created_at desc);
create table public.manual_csv_mappings(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 name text not null, headers_hash text not null, mapping jsonb not null, created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organisation_id,headers_hash)
);

do $$ declare t text; begin foreach t in array array['manual_records','manual_record_revisions','manual_custom_fields','manual_custom_values','manual_attachments','manual_imports','manual_csv_mappings'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy "Tenant read %1$s" on public.%1$I for select to authenticated using(public.is_organisation_member(organisation_id))',t); end loop; end $$;
create policy "Editors create manual records" on public.manual_records for insert to authenticated with check(created_by=auth.uid() and updated_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Editors update manual records" on public.manual_records for update to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin','manager'])) with check(updated_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Editors create revisions" on public.manual_record_revisions for insert to authenticated with check(changed_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Admins manage field definitions" on public.manual_custom_fields for all to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin'])) with check(created_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin']));
create policy "Editors create field values" on public.manual_custom_values for insert to authenticated with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Editors update field values" on public.manual_custom_values for update to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin','manager'])) with check(public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Editors create attachments" on public.manual_attachments for insert to authenticated with check(uploaded_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Editors create imports" on public.manual_imports for insert to authenticated with check(uploaded_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin','manager']));
create policy "Editors manage mappings" on public.manual_csv_mappings for all to authenticated using(public.has_organisation_role(organisation_id,array['owner','admin','manager'])) with check(created_by=auth.uid() and public.has_organisation_role(organisation_id,array['owner','admin','manager']));

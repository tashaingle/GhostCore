create table public.organisation_branding (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  primary_logo_url text,
  secondary_logo_url text,
  icon_url text,
  primary_color text not null default '#2563eb' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#111827' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#14b8a6' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  heading_font text not null default 'Inter' check (char_length(heading_font) between 1 and 100),
  body_font text not null default 'Inter' check (char_length(body_font) between 1 and 100),
  notes text not null default '' check (char_length(notes) <= 5000),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organisation_branding enable row level security;

create policy "Members read organisation branding"
  on public.organisation_branding for select to authenticated
  using (public.is_organisation_member(organisation_id));

create policy "Managers create organisation branding"
  on public.organisation_branding for insert to authenticated
  with check (
    updated_by = auth.uid()
    and public.has_organisation_role(organisation_id, array['owner','admin','manager'])
  );

create policy "Managers update organisation branding"
  on public.organisation_branding for update to authenticated
  using (public.has_organisation_role(organisation_id, array['owner','admin','manager']))
  with check (
    updated_by = auth.uid()
    and public.has_organisation_role(organisation_id, array['owner','admin','manager'])
  );

alter table public.organisation_branding
  add column neutral_color text not null default '#6b7280'
    check (neutral_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column surface_color text not null default '#f4f4f5'
    check (surface_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column highlight_color text not null default '#f59e0b'
    check (highlight_color ~ '^#[0-9A-Fa-f]{6}$');

drop policy if exists "Managers create organisation branding" on public.organisation_branding;
create policy "Managers create organisation branding"
  on public.organisation_branding for insert to authenticated
  with check (
    updated_by = (select auth.uid())
    and public.has_organisation_role(organisation_id, array['owner','admin','manager'])
  );

drop policy if exists "Managers update organisation branding" on public.organisation_branding;
create policy "Managers update organisation branding"
  on public.organisation_branding for update to authenticated
  using (public.has_organisation_role(organisation_id, array['owner','admin','manager']))
  with check (
    updated_by = (select auth.uid())
    and public.has_organisation_role(organisation_id, array['owner','admin','manager'])
  );

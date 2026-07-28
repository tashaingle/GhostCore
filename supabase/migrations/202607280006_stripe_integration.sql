create table if not exists public.stripe_event_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  stripe_account_id text not null check (char_length(stripe_account_id) between 6 and 255),
  livemode boolean not null,
  stripe_event_id text not null check (char_length(stripe_event_id) between 6 and 255),
  stripe_event_type text not null check (char_length(stripe_event_type) between 1 and 255),
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','failed')),
  attempts integer not null default 1 check (attempts > 0),
  error_category text,
  processed_at timestamptz,
  unique (integration_id,stripe_event_id)
);
create index if not exists stripe_receipts_lookup_idx on public.stripe_event_receipts(stripe_account_id,livemode,received_at desc);
create unique index if not exists integrations_stripe_account_mode_org_unique
  on public.integrations(organisation_id,provider,provider_account_id,((settings->>'mode')))
  where provider='stripe' and provider_account_id is not null;
alter table public.stripe_event_receipts enable row level security;
create policy "Members view organisation Stripe receipts" on public.stripe_event_receipts for select using (
  exists(select 1 from public.organisation_members m where m.organisation_id=stripe_event_receipts.organisation_id and m.user_id=auth.uid() and m.status='active')
);
create policy "Admins manage organisation Stripe receipts" on public.stripe_event_receipts for all using (
  exists(select 1 from public.organisation_members m where m.organisation_id=stripe_event_receipts.organisation_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin'))
) with check (
  exists(select 1 from public.organisation_members m where m.organisation_id=stripe_event_receipts.organisation_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin'))
);

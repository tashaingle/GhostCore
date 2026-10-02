-- Email delivery outbox for notification and approval emails.
-- Rows are queued and sent by the `email.deliver` background job. A unique dedupe key per
-- recipient and source means repeated scans can never email the same thing twice.
create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('notification', 'approval')),
  source_id uuid not null,
  dedupe_key text not null unique,
  recipient_email text not null,
  subject text not null check (char_length(subject) <= 300),
  html_body text not null,
  text_body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_outbox_pending_idx
  on public.email_outbox (organisation_id, next_attempt_at) where status = 'pending';
create index if not exists email_outbox_org_created_idx
  on public.email_outbox (organisation_id, created_at desc);

-- No policies: only the service role used by background jobs may read or write the outbox.
alter table public.email_outbox enable row level security;

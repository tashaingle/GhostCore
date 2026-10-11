-- The Monday summary email: sent to every member by default. People who turn it off are listed
-- here (per organisation), so there's nothing to set up for everyone else.
create table if not exists public.weekly_summary_opt_outs (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organisation_id, user_id)
);
alter table public.weekly_summary_opt_outs enable row level security;

-- People manage only their own choice, and only for organisations they belong to.
drop policy if exists "weekly_summary_opt_outs_own" on public.weekly_summary_opt_outs;
create policy "weekly_summary_opt_outs_own" on public.weekly_summary_opt_outs
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.organisation_members m
      where m.organisation_id = weekly_summary_opt_outs.organisation_id
        and m.user_id = auth.uid() and m.status = 'active'
    )
  );

-- The outbox gains a third kind of email.
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('notification', 'approval', 'weekly_summary'));

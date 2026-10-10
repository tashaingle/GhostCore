-- Subscriptions: one per person who creates organisations. £4.99/month covers their first three
-- organisations, then £1 each; invited team members never pay. Organisations inherit access from
-- the person who created them.

create table if not exists public.billing_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none'
    check (status in (
      'none', 'trialing', 'active', 'past_due', 'unpaid', 'canceled',
      'incomplete', 'incomplete_expired', 'paused'
    )),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  organisations_billed integer not null default 0,
  -- The free trial is once per person, even if they cancel and come back.
  trial_used boolean not null default false,
  -- Free access, e.g. the founder's own account.
  comped boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_accounts enable row level security;

-- People can see their own billing. All writes go through the server (service role), driven by
-- Stripe's webhooks, so there are deliberately no insert/update/delete policies.
drop policy if exists "billing_accounts_select_own" on public.billing_accounts;
create policy "billing_accounts_select_own" on public.billing_accounts
  for select using (user_id = auth.uid());

-- Whether an organisation can be used: its creator is comped, trialing, paying, or retrying a
-- failed payment (Stripe retries for a while before giving up). Only answers for members.
create or replace function public.organisation_has_access(target_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organisations o
    join public.billing_accounts b on b.user_id = o.created_by
    where o.id = target_organisation_id
      and (b.comped or b.status in ('trialing', 'active', 'past_due'))
      and exists (
        select 1 from public.organisation_members m
        where m.organisation_id = o.id and m.user_id = auth.uid() and m.status = 'active'
      )
  );
$$;
revoke all on function public.organisation_has_access(uuid) from public;
grant execute on function public.organisation_has_access(uuid) to authenticated;

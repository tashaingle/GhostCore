-- Trial emails (day 1, and two days before the trial ends) join the email outbox.
alter table public.email_outbox drop constraint if exists email_outbox_kind_check;
alter table public.email_outbox
  add constraint email_outbox_kind_check
  check (kind in ('notification', 'approval', 'weekly_summary', 'trial'));

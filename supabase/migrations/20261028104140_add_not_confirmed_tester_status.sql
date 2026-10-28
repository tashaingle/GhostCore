alter table public.email_contacts
  drop constraint email_contacts_testing_status_check;

alter table public.email_contacts
  add constraint email_contacts_testing_status_check
  check (
    testing_status in (
      'testing',
      'invited',
      'paused',
      'completed',
      'not_testing',
      'not_confirmed'
    )
  );

alter table public.email_contacts
  add column testing_status text not null default 'invited'
    check (testing_status in ('testing', 'invited', 'paused', 'completed', 'not_testing')),
  add column review_rating smallint check (review_rating between 1 and 5),
  add column testing_review text check (testing_review is null or char_length(testing_review) <= 2000);

create policy "Members update email contacts" on public.email_contacts
  for update to authenticated
  using (public.is_organisation_member(organisation_id))
  with check (public.is_organisation_member(organisation_id));

grant update on table public.email_contacts to authenticated;

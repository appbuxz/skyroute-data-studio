begin;

create table public.agency_flight_journal (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  author_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  client_label text not null check (char_length(client_label) <= 120 and client_label ~ '[^[:space:]]'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object')
);

create index agency_flight_journal_org_created_idx
  on public.agency_flight_journal (organization_id, created_at desc, id desc);

alter table public.agency_flight_journal enable row level security;
revoke all privileges on table public.agency_flight_journal from public, anon, authenticated;
grant select on table public.agency_flight_journal to authenticated;
grant insert (organization_id, author_id, client_label, snapshot)
  on table public.agency_flight_journal to authenticated;

create policy agency_flight_journal_select_member
  on public.agency_flight_journal for select to authenticated
  using (
    exists (
      select 1 from public.organization_members as membership
      where membership.organization_id = agency_flight_journal.organization_id
        and membership.user_id = (select auth.uid())
    )
  );

create policy agency_flight_journal_insert_member
  on public.agency_flight_journal for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.organization_members as membership
      where membership.organization_id = agency_flight_journal.organization_id
        and membership.user_id = (select auth.uid())
    )
  );

commit;

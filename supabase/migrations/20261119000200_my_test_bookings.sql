alter table public.flight_test_booking_attempts
  add column user_id uuid,
  add column organization_id uuid,
  add column flight jsonb,
  add constraint flight_test_booking_attempts_owner_metadata check (
    (user_id is null and organization_id is null and flight is null)
    or (user_id is not null and flight is not null and jsonb_typeof(flight) = 'object')
  );

create index flight_test_booking_attempts_personal_owner_idx
  on public.flight_test_booking_attempts (user_id)
  where organization_id is null and pnr is not null;

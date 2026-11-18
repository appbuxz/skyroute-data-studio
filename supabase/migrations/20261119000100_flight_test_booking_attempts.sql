create table public.flight_test_booking_attempts (
  attempt_key text primary key,
  pnr text check (pnr ~ '^[A-Z0-9]{6}$')
);

alter table public.flight_test_booking_attempts enable row level security;
revoke all on public.flight_test_booking_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.flight_test_booking_attempts to service_role;

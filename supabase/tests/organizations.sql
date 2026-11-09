-- Run with psql -X --set=ON_ERROR_STOP=1 against a DISPOSABLE Supabase database
-- after applying the migration. Requires a privileged role able to SET ROLE.
-- This is a plain SQL assertion script; pgTAP is not required.
-- All fixtures, grants, and helper functions are rolled back on success.
-- Use a fresh, dedicated psql connection with --file, not an existing transaction.
\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- Refuse to run unless the caller explicitly acknowledges the disposable DB.
\if :{?disposable_database}
\else
  do $$ begin
    raise exception 'Pass --set=disposable_database=true only for a disposable database';
  end; $$;
\endif
\if :disposable_database
\else
  do $$ begin
    raise exception 'disposable_database must be true';
  end; $$;
\endif

-- SQL exceptions plus ON_ERROR_STOP produce a nonzero psql status. Unlike
-- "\quit 1", this cannot be mistaken for a successful skipped test run.
begin;
set local search_path = pg_catalog, public;
set local row_security = on;

create temporary table organization_test_marker (id integer);

create function pg_temp.assert_true(condition boolean, label text)
returns void language plpgsql security invoker as $$
begin
  if condition is distinct from true then
    raise exception 'Assertion failed: %', label;
  end if;
end;
$$;

create function pg_temp.expect_sqlstate(statement text, expected text, label text)
returns void language plpgsql security invoker as $$
declare
  actual text;
  actual_message text;
  actual_detail text;
  actual_constraint text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics
      actual = returned_sqlstate,
      actual_message = message_text,
      actual_detail = pg_exception_detail,
      actual_constraint = constraint_name;
    if actual = expected then
      return;
    end if;
    raise exception 'Assertion failed: %, expected SQLSTATE %, got %',
      label, expected, actual
      using detail = format('role=%s; message=%s; detail=%s; constraint=%s; SQL=%s',
        current_user, actual_message, actual_detail, actual_constraint, statement);
  end;
  raise exception 'Assertion failed: %, statement unexpectedly succeeded', label
    using detail = format('role=%s; SQL=%s', current_user, statement);
end;
$$;

create function pg_temp.set_claims(claims jsonb)
returns void language plpgsql security invoker as $$
begin
  -- Supabase auth.uid() can prefer the legacy subject GUC over JSON claims.
  -- Clear it on EVERY simulated request, including anonymous/missing-sub cases.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claim.email', '', true);
  perform set_config('request.jwt.claims', claims::text, true);
  perform pg_temp.assert_true(
    current_user::text = (claims ->> 'role'), 'SET ROLE matches simulated JWT role');
  perform pg_temp.assert_true(
    auth.uid() is not distinct from nullif(claims ->> 'sub', '')::uuid,
    'auth.uid() matches simulated subject');
  perform pg_temp.assert_true(
    row_security_active('public.organizations'::regclass)
    and row_security_active('public.organization_members'::regclass),
    'application role must not own tables or bypass RLS');
end;
$$;

-- Helpers deliberately run as the caller, never as a privileged definer.
do $$
begin
  execute format('grant usage on schema %I to anon, authenticated',
    pg_my_temp_schema()::regnamespace::text);
end;
$$;
-- Functions otherwise default to PUBLIC EXECUTE, which could conceal an
-- accidentally missing role-specific execution grant.
revoke all on function pg_temp.assert_true(boolean, text) from public;
revoke all on function pg_temp.expect_sqlstate(text, text, text) from public;
revoke all on function pg_temp.set_claims(jsonb) from public;
grant execute on function pg_temp.assert_true(boolean, text) to anon, authenticated;
grant execute on function pg_temp.expect_sqlstate(text, text, text) to anon, authenticated;
grant execute on function pg_temp.set_claims(jsonb) to anon, authenticated;

-- Verify effective privileges, including inherited grants. Checking these
-- separately prevents a generic 42501 from concealing a schema/ACL defect.
do $$
declare
  application_role text;
  relation text;
  permission text;
begin
  foreach application_role in array array['anon', 'authenticated'] loop
    perform pg_temp.assert_true(
      has_schema_privilege(application_role, pg_my_temp_schema(), 'USAGE')
      and has_function_privilege(application_role, 'pg_temp.assert_true(boolean,text)', 'EXECUTE')
      and has_function_privilege(application_role, 'pg_temp.expect_sqlstate(text,text,text)', 'EXECUTE')
      and has_function_privilege(application_role, 'pg_temp.set_claims(jsonb)', 'EXECUTE'),
      application_role || ' can resolve and execute temporary helpers');
    perform pg_temp.assert_true(
      has_schema_privilege(application_role, 'public', 'USAGE')
      and has_schema_privilege(application_role, 'auth', 'USAGE')
      and has_function_privilege(application_role, 'auth.uid()', 'EXECUTE'),
      application_role || ' has schema and auth.uid() prerequisites');
    foreach relation in array array['public.organizations', 'public.organization_members'] loop
      perform pg_temp.assert_true(
        has_table_privilege(application_role, relation, 'SELECT') = (application_role = 'authenticated'),
        application_role || ' expected SELECT grant on ' || relation);
      foreach permission in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        perform pg_temp.assert_true(
          not has_table_privilege(application_role, relation, permission),
          application_role || ' lacks ' || permission || ' on ' || relation);
      end loop;
    end loop;
  end loop;
end;
$$;

-- Fail early if the database has pre-existing organization data: this suite
-- uses total row counts to detect leaks rather than filtering leaks away.
select pg_temp.assert_true(
  (select count(*) = 0 from public.organizations)
  and (select count(*) = 0 from public.organization_members),
  'organization tables must be empty in the disposable test database'
);

-- Alice owns A, Bob owns B, Carol is admin in A and member in B, Dave has none.
insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'alice-org-test@example.invalid', now(), now()),
  ('f1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'bob-org-test@example.invalid', now(), now()),
  ('f1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'carol-org-test@example.invalid', now(), now()),
  ('f1000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'dave-org-test@example.invalid', now(), now());

insert into public.organizations (id, name) values
  ('f2000000-0000-4000-8000-000000000001', 'Agency A'),
  ('f2000000-0000-4000-8000-000000000002', 'Agency B');

insert into public.organization_members (organization_id, user_id, role) values
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'owner'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000002', 'owner'),
  ('f2000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 'admin'),
  ('f2000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000003', 'member');

select pg_temp.assert_true(
  (select count(*) = 2 and bool_and(relrowsecurity)
   from pg_class where oid in (
     'public.organizations'::regclass,
     'public.organization_members'::regclass
   )), 'RLS enabled on both tables'
);

set local role anon;
select pg_temp.set_claims('{"role":"anon"}'::jsonb);
select pg_temp.assert_true(auth.uid() is null, 'anonymous identity');
select pg_temp.expect_sqlstate('select * from public.organizations', '42501', 'anonymous organization read');
select pg_temp.expect_sqlstate('select * from public.organization_members', '42501', 'anonymous membership read');
select pg_temp.expect_sqlstate('insert into public.organizations (name) values (''Anonymous agency'')', '42501', 'anonymous organization insert');
select pg_temp.expect_sqlstate('update public.organizations set name = ''Anonymous change''', '42501', 'anonymous organization update');
select pg_temp.expect_sqlstate('delete from public.organizations', '42501', 'anonymous organization delete');
select pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id) values (''f2000000-0000-4000-8000-000000000001'', ''f1000000-0000-4000-8000-000000000004'')', '42501', 'anonymous membership insert');
select pg_temp.expect_sqlstate('update public.organization_members set role = ''admin''', '42501', 'anonymous membership update');
select pg_temp.expect_sqlstate('delete from public.organization_members', '42501', 'anonymous membership delete');
reset role;

set local role authenticated;
select pg_temp.set_claims('{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}'::jsonb);
select pg_temp.assert_true(auth.uid() = 'f1000000-0000-4000-8000-000000000001'::uuid, 'verified test identity Alice');
select pg_temp.assert_true((select count(*) = 1 from public.organization_members), 'Alice sees one own membership');
select pg_temp.assert_true((select count(*) = 1 from public.organizations), 'Alice sees one organization');
select pg_temp.assert_true(exists(select 1 from public.organizations where name = 'Agency A'), 'Alice sees A');
select pg_temp.assert_true(not exists(select 1 from public.organizations where id = 'f2000000-0000-4000-8000-000000000002'), 'Alice cannot select B by forged ID');
select pg_temp.assert_true(not exists(select 1 from public.organization_members where user_id <> auth.uid()), 'Alice cannot read colleagues or other tenants');

select pg_temp.set_claims('{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}'::jsonb);
select pg_temp.assert_true((select count(*) = 1 from public.organizations), 'Bob sees one organization');
select pg_temp.assert_true(exists(select 1 from public.organizations where name = 'Agency B'), 'Bob sees B');
select pg_temp.assert_true(not exists(select 1 from public.organizations where name = 'Agency A'), 'Bob cannot see A');

select pg_temp.set_claims('{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}'::jsonb);
select pg_temp.assert_true((select count(*) = 2 from public.organizations), 'Carol sees both organizations');
select pg_temp.assert_true((select count(*) = 2 from public.organization_members), 'Carol sees both own memberships');
select pg_temp.assert_true(not exists(select 1 from public.organization_members where user_id <> auth.uid()), 'Carol cannot see either owner');

select pg_temp.set_claims('{"sub":"f1000000-0000-4000-8000-000000000004","role":"authenticated"}'::jsonb);
select pg_temp.assert_true(not exists(select 1 from public.organizations), 'Dave sees no organizations');
select pg_temp.assert_true(not exists(select 1 from public.organization_members), 'Dave sees no memberships');

select pg_temp.set_claims('{"role":"authenticated"}'::jsonb);
select pg_temp.assert_true(auth.uid() is null, 'missing subject is not an identity');
select pg_temp.assert_true(not exists(select 1 from public.organizations), 'missing subject sees no organizations');
select pg_temp.assert_true(not exists(select 1 from public.organization_members), 'missing subject sees no memberships');

-- Repeat actual writes for owner, admin/member, and nonmember identities.
-- Permission errors must happen even for an UPDATE or DELETE matching no rows.
do $$
declare
  actor uuid;
begin
  foreach actor in array array[
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'f1000000-0000-4000-8000-000000000003'::uuid,
    'f1000000-0000-4000-8000-000000000004'::uuid
  ] loop
    perform pg_temp.set_claims(json_build_object('sub', actor, 'role', 'authenticated')::jsonb);
    perform pg_temp.expect_sqlstate('insert into public.organizations (name) values (''Forged agency'')', '42501', 'organization insert denied');
    perform pg_temp.expect_sqlstate('update public.organizations set name = ''Changed''', '42501', 'organization update denied');
    perform pg_temp.expect_sqlstate('delete from public.organizations', '42501', 'organization delete denied');
    perform pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id, role) values (''f2000000-0000-4000-8000-000000000002'', auth.uid(), ''admin'')', '42501', 'membership insert denied');
    perform pg_temp.expect_sqlstate('update public.organization_members set role = ''owner''', '42501', 'membership escalation denied');
    perform pg_temp.expect_sqlstate('delete from public.organization_members', '42501', 'membership delete denied');
  end loop;
end;
$$;
reset role;

-- Verify RLS still protects rows if SELECT is accidentally granted to anon.
savepoint anonymous_rls_probe;
grant select on public.organizations, public.organization_members to anon;
set local role anon;
select pg_temp.set_claims('{"role":"anon"}'::jsonb);
select pg_temp.assert_true(
  has_table_privilege(current_user, 'public.organizations', 'SELECT')
  and has_table_privilege(current_user, 'public.organization_members', 'SELECT'),
  'anonymous probe has SELECT grants: empty results must come from RLS');
select pg_temp.assert_true(not exists(select 1 from public.organizations), 'RLS independently blocks anonymous organization reads');
select pg_temp.assert_true(not exists(select 1 from public.organization_members), 'RLS independently blocks anonymous membership reads');
reset role;

rollback to savepoint anonymous_rls_probe;
release savepoint anonymous_rls_probe;
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.organizations', 'SELECT')
  and not has_table_privilege('anon', 'public.organization_members', 'SELECT'),
  'anonymous probe SELECT grants rolled back');

-- Verify missing write policies independently of revoked write privileges.
savepoint authenticated_rls_probe;
grant insert, update, delete on public.organizations, public.organization_members to authenticated;
set local role authenticated;
select pg_temp.set_claims('{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}'::jsonb);
select pg_temp.assert_true(
  (select bool_and(has_table_privilege(current_user, relation, permission))
   from unnest(array['public.organizations', 'public.organization_members']) as relations(relation)
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as permissions(permission)),
  'authenticated probe has write grants: denials must come from RLS');
select pg_temp.expect_sqlstate('insert into public.organizations (name) values (''RLS blocked'')', '42501', 'RLS blocks organization insert');
select pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id) values (''f2000000-0000-4000-8000-000000000002'', auth.uid())', '42501', 'RLS blocks cross-tenant membership insert');
with changed as (update public.organizations set name = 'RLS changed' returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'RLS updates zero organizations');
with changed as (delete from public.organizations returning id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'RLS deletes zero organizations');
with changed as (update public.organization_members set role = 'admin' returning user_id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'RLS updates zero memberships');
with changed as (delete from public.organization_members returning user_id)
select pg_temp.assert_true((select count(*) = 0 from changed), 'RLS deletes zero memberships');
reset role;

rollback to savepoint authenticated_rls_probe;
release savepoint authenticated_rls_probe;
select pg_temp.assert_true(
  (select bool_and(not has_table_privilege('authenticated', relation, permission))
   from unnest(array['public.organizations', 'public.organization_members']) as relations(relation)
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as permissions(permission)),
  'authenticated probe write grants rolled back');

-- Constraints are tested with privileges so permission checks cannot mask them.
select pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id) values (''f2000000-0000-4000-8000-000000000001'', ''f1000000-0000-4000-8000-000000000001'')', '23505', 'duplicate membership');
select pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id, role) values (''f2000000-0000-4000-8000-000000000001'', ''f1000000-0000-4000-8000-000000000004'', ''owner'')', '23505', 'second owner');
select pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id, role) values (''f2000000-0000-4000-8000-000000000001'', ''f1000000-0000-4000-8000-000000000004'', ''superadmin'')', '23514', 'invalid role');
select pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id) values (''f2000000-0000-4000-8000-000000000099'', ''f1000000-0000-4000-8000-000000000004'')', '23503', 'unknown organization');
select pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id) values (''f2000000-0000-4000-8000-000000000001'', ''f1000000-0000-4000-8000-000000000099'')', '23503', 'unknown Auth user');
select pg_temp.expect_sqlstate('delete from auth.users where id = ''f1000000-0000-4000-8000-000000000001''', '23503', 'owner Auth deletion restricted');
select pg_temp.expect_sqlstate('delete from auth.users where id = ''f1000000-0000-4000-8000-000000000003''', '23503', 'nonowner Auth deletion restricted');
select pg_temp.expect_sqlstate('delete from public.organizations where id = ''f2000000-0000-4000-8000-000000000001''', '23503', 'organization deletion restricted');
select pg_temp.expect_sqlstate('insert into public.organizations (name) values (''   '')', '23514', 'blank organization name');
select pg_temp.expect_sqlstate('insert into public.organization_members (organization_id, user_id, role) values (''f2000000-0000-4000-8000-000000000001'', ''f1000000-0000-4000-8000-000000000004'', null)', '23502', 'null role');
select pg_temp.expect_sqlstate('update public.organization_members set organization_id = ''f2000000-0000-4000-8000-000000000099'' where user_id = ''f1000000-0000-4000-8000-000000000003'' and organization_id = ''f2000000-0000-4000-8000-000000000001''', '23503', 'membership cannot move to unknown organization');

-- A revocation is visible on the next query, without refreshing JWT claims.
delete from public.organization_members
where organization_id = 'f2000000-0000-4000-8000-000000000002'
  and user_id = 'f1000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.set_claims('{"sub":"f1000000-0000-4000-8000-000000000003","role":"authenticated"}'::jsonb);
select pg_temp.assert_true((select count(*) = 1 from public.organizations), 'revoked membership removes B visibility');
select pg_temp.assert_true(not exists(select 1 from public.organizations where name = 'Agency B'), 'revoked organization cannot be selected');
reset role;

rollback;
\echo 'Organization RLS and constraint assertions passed; fixtures and test grants rolled back.'

# Organization provisioning — Phase 1

Phase 1 adds database tables and policies only. It does **not** authorize flight
searches by organization, change workspace selection, or isolate existing browser
snapshots. Those application changes belong to Phase 2 and later.

## Privileged access and operating rules

Only a trusted project operator may provision organizations or change memberships.
Use the Supabase SQL editor or a controlled privileged PostgreSQL session. Verify
the project/environment before executing anything. Do not give database credentials
or service-role keys to the browser or add them to the running application.

Verify the agency owner's identity and approval outside the application. Resolve
the existing user's UUID through the privileged Auth dashboard; do not infer agency
membership from email domains. No self-service signup or invitation workflow exists.

All examples below are manual templates, not migrations. Replace every placeholder
before running. The all-zero UUID is intentionally a placeholder. Do not execute
the complete document as one script. `DO` blocks use SQL literals, not psql variable
interpolation; quote names correctly if editing the literals.

Lock the organization's row before every membership mutation. This serializes
operators following this runbook. Direct privileged writes can bypass these rules.
On any error, roll back the transaction before attempting another operation.

Roles `owner`, `admin`, and `member` currently have identical application database
permissions: SELECT their own memberships and their organizations. None may write
either table. Role-specific management interfaces are deferred.

## Create an organization and its first owner

The owner must already exist in Supabase Auth. Creation is atomic: the organization
cannot remain behind if the owner insertion fails. The operator receives the new
organization UUID as a notice.

```sql
begin;
do $$
declare
  owner_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace
  agency_name text := 'REPLACE WITH VERIFIED AGENCY NAME';
  organization_id uuid;
begin
  if not exists (select 1 from auth.users where id = owner_id) then
    raise exception 'Owner must be an existing Auth user';
  end if;

  insert into public.organizations (name)
  values (btrim(agency_name)) returning id into organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (organization_id, owner_id, 'owner');

  raise notice 'Created organization %', organization_id;
end;
$$;
commit;
```

Do not rerun creation blindly after an uncertain response. Inspect existing
organizations and memberships first: names are intentionally not globally unique.

## Add a member or admin

Obtain owner approval and verify the target Auth UUID. Default to `member`; assign
`admin` only when explicitly requested. This operation does not transfer ownership.

```sql
begin;
do $$
declare
  agency_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace
  member_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace
  member_role text := 'member';
begin
  perform 1 from public.organizations where id = agency_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if member_role not in ('admin', 'member') then
    raise exception 'Use the ownership-transfer procedure for owner changes';
  end if;
  if (select count(*) from public.organization_members
      where organization_id = agency_id and role = 'owner') <> 1 then
    raise exception 'Organization must have exactly one owner';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (agency_id, member_id, member_role);
end;
$$;
commit;
```

A duplicate membership fails instead of silently changing an existing role. A
nonexistent Auth user fails the foreign key. For an approved nonowner role change,
use the same organization lock and an UPDATE filtered by organization UUID, user
UUID, and `role <> 'owner'`; require exactly one affected row.

## Transfer ownership

The replacement must already belong to this organization. Record and verify the
expected current owner to prevent acting on stale approval. Demote the old owner
before promotion because the one-owner unique index is immediate. Both updates
commit together; no intermediate state is visible to other transactions.

```sql
begin;
do $$
declare
  agency_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace
  old_owner_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace
  new_owner_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace
  changed integer;
begin
  perform 1 from public.organizations where id = agency_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if old_owner_id = new_owner_id then
    raise exception 'Replacement owner must be different';
  end if;

  perform 1 from public.organization_members
  where organization_id = agency_id and user_id = new_owner_id;
  if not found then raise exception 'Replacement must already be a member'; end if;

  update public.organization_members set role = 'admin'
  where organization_id = agency_id and user_id = old_owner_id and role = 'owner';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Expected owner no longer matches'; end if;

  update public.organization_members set role = 'owner'
  where organization_id = agency_id and user_id = new_owner_id;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Replacement membership disappeared'; end if;

  if (select count(*) from public.organization_members
      where organization_id = agency_id and role = 'owner') <> 1 then
    raise exception 'Ownership invariant failed';
  end if;
end;
$$;
commit;
```

## Remove a member

Always filter by **both** organization and user UUID. The same user may belong to
other agencies. Transfer ownership first when removing the owner.

```sql
begin;
do $$
declare
  agency_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace
  member_id uuid := '00000000-0000-0000-0000-000000000000'; -- replace
  changed integer;
begin
  perform 1 from public.organizations where id = agency_id for update;
  if not found then raise exception 'Organization not found'; end if;
  if (select count(*) from public.organization_members
      where organization_id = agency_id and role = 'owner') <> 1 then
    raise exception 'Organization must have exactly one owner';
  end if;

  delete from public.organization_members
  where organization_id = agency_id and user_id = member_id and role <> 'owner';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Membership not found or target is the owner';
  end if;
end;
$$;
commit;
```

Membership removal affects subsequent RLS queries immediately after commit. It
does not retract previously downloaded data or cancel an already authorized
request. The current flight-search endpoint verifies identity and organization
membership on the server before calling the flight provider; client selection
alone does not authorize access.

## Safely delete an Auth user

Both foreign keys use `ON DELETE RESTRICT`. Deleting an Auth user with *any*
membership fails, including nonowners. This prevents silent owner removal.

1. Verify deletion authorization. Disable sign-in/revoke sessions using supported
   privileged Auth controls where available; membership cleanup is still required.
2. Inspect all memberships for the verified Auth UUID in the SQL editor:

   ```sql
   select membership.organization_id, organization.name, membership.role
   from public.organization_members as membership
   join public.organizations as organization
     on organization.id = membership.organization_id
   where membership.user_id = '<verified-auth-user-uuid>'::uuid;
   ```

3. Transfer each ownership to a verified existing member. If no successor exists,
   stop and agree an agency closure procedure; do not leave an active agency
   ownerless.
4. Remove the user's remaining memberships using the procedure above. Check that
   none remain. Prevent concurrent operators from re-adding the user during cleanup.
5. Delete through the supported Supabase Auth dashboard/admin operation. Do not
   normally delete directly from `auth.users`. If deletion is restricted, investigate
   new memberships or other dependencies; never disable the foreign key.

Auth administration and database cleanup are separate operations, not one atomic
transaction. Future searches/reports may introduce additional deletion or retention
requirements. Review those before deleting users. Never expose privileged Auth
operations in the client.

## Ownership and operational limitations

- The partial unique index enforces **at most one** owner. It does not require an
  owner to exist. Atomic provisioning and these operator procedures maintain at
  least one owner. A privileged operator can bypass that operational invariant.
- Organizations cannot be deleted while memberships reference them. No agency
  deletion workflow is introduced here.
- Users see their own membership rows, not a team roster. Organization names are
  visible only to members.
- No tenant selection, application authorization, snapshots, quotas, invitations,
  reporting tables, ownership RPCs, or audit-log table are added in Phase 1.
- RLS does not constrain a privileged operator or a role with BYPASSRLS. Keep normal
  requests on the bearer-authenticated publishable-key client in future phases.
- No paid service or new dependency is needed. Provider usage can still cost money.

An operator can check for ownerless organizations with:

```sql
select organization.id, organization.name
from public.organizations as organization
left join public.organization_members as membership
  on membership.organization_id = organization.id and membership.role = 'owner'
group by organization.id, organization.name
having count(membership.user_id) <> 1;
```

## Review and test the migration manually

Review the migration and tests as text first. Confirm UUID keys, composite membership
uniqueness, the one-owner partial index, RESTRICT foreign keys, explicit grants,
enabled RLS, and SELECT-only policies. Membership RLS queries no membership table,
so the organization policy does not introduce recursive evaluation.

Use only an **already available disposable local Supabase database** with its real
`auth.users`, `auth.uid()`, `anon`, and `authenticated` roles. A generic empty
PostgreSQL database is not sufficient. Do not point these commands at hosted
Supabase or a developer database containing valuable data. The migration commits
its changes; the test suite rolls back its fixtures and temporary grants.

Example for the standard local Supabase port (verify your own local connection):

```sh
psql -X -W "host=127.0.0.1 port=54322 dbname=postgres user=postgres" \
  --set=ON_ERROR_STOP=1 \
  --file=supabase/migrations/20261110000100_organizations.sql

psql -X -W "host=127.0.0.1 port=54322 dbname=postgres user=postgres" \
  --set=ON_ERROR_STOP=1 --set=disposable_database=true \
  --file=supabase/tests/organizations.sql
```

Enter the local password at the prompt; do not put credentials in command history.
The tests require empty organization tables and a privileged session able to
`SET ROLE`. They create four Auth fixtures, test real `anon`/`authenticated` roles
and `request.jwt.claims`, check privileges and RLS separately, and test constraints
under privilege so permission errors cannot mask constraint failures.

Expected outcome: psql exits zero and prints the assertion success message. On
failure, ON_ERROR_STOP stops execution and the disconnect rolls back the test
transaction. A success message does not verify actual browser cookies, signed JWT
validation, or server-function behavior; those require later application tests.

The test suite has no pgTAP requirement and is **not** a `supabase test db` TAP suite.
Do not claim database verification from TypeScript checks or SQL text inspection.
Do not apply this migration remotely as part of Phase 1 development validation.

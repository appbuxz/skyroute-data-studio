# Local Supabase organization integration tests

This opt-in suite exercises real local Supabase Auth, PostgREST and PostgreSQL.
It does not mock Supabase clients, identity verification, database responses, or
organization authorization. It is separate from the ordinary offline Vitest suite.

## Preconditions and local-only safeguards

- Use the already running local Supabase instance: API `http://127.0.0.1:54321`,
  PostgreSQL `127.0.0.1:54322`, database/user `postgres`.
- The existing organization migration must already be applied. Tests never apply
  migrations, reset the database, or change policies.
- Local email signup/password sign-in must be enabled with confirmations disabled,
  as in the checked-in local configuration. Fixture addresses use `example.test`.
- Existing repository dependencies and the `psql` client must be available. No new
  dependencies, containers, or services are installed by the tests.
- Use a dedicated development instance. Existing unrelated data may coexist: all
  fixture writes and cleanup are scoped to fresh UUIDs and a unique run prefix.

Put the **local** API URL and public anon/publishable key in ignored
`.env.integration.local`, using these variable names:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<local anon or publishable key>
```

Obtain the public key from local Studio or local CLI output. Do not use a hosted
project's key or a service-role key. Keep this file owner-readable and out of Git.
Never paste tokens or credentials into logs or commit them. Existing `.env` and
`.env.local` files do not need to be modified.

The integration config rejects non-loopback targets, URL credentials and privileged
API keys. Its network guard allows only the configured local Auth/PostgREST paths
and refuses redirects. This also blocks actual SerpApi/Travelport requests. Only
denied flight searches are executed; authorized provider requests are not tested.

Fixture SQL uses only an explicitly addressed local PostgreSQL connection. It uses
the standard local development password unless `LOCAL_SUPABASE_DB_PASSWORD` is set
in the process environment. If customized, supply it through a protected prompt or
secret environment injection, never a command-line URL. Child-process credentials
and SQL diagnostics are not printed.

## Run

Run from the repository root:

```sh
./node_modules/.bin/vite build --mode integration
./node_modules/.bin/tsc -p tsconfig.integration.json --noEmit --incremental false
./node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=verbose
```

The fresh build is required to exercise the actual compiler-extracted
`getOrganizationMemberships` and `searchFlightsServer` handlers without mocking
`createServerFn`. The suite locates their exports in `.output/server/_ssr` and
rejects stale builds for the relevant application modules. A change to the framework
compiler's export convention may require updating this test-only bridge.

The runner needs permission to reach loopback services and execute local `psql`.
If a sandbox blocks those operations, approve local-only execution; do not replace
the local URL with a remote project URL. The ordinary `vitest run` command continues
to run only the existing `src/` unit/UI tests and performs no integration setup.

## Coverage

Four disposable users are created and signed in through actual Auth HTTP requests:
Alice owns A, Bob owns B, Carol is admin in A and member in B, and Dave has no agency.
Two disposable organizations and their memberships are inserted with privileged SQL
because application roles intentionally have no provisioning privileges.

The suite verifies:

- Actual password authentication and `getUser()` identity verification.
- Own-membership visibility even without a client-side user filter.
- Explicit attempts to read another user's memberships return no rows.
- Real organization join names/roles returned by `getOrganizationMemberships`.
- Empty, single, and multiple membership lists.
- Organization isolation through direct PostgREST reads.
- Automatic resolution of a sole membership by `requireOrganization()`.
- Explicit selection requirements and valid selection for multiple memberships.
- Identical access-denied errors for inaccessible and nonexistent selections.
- Anonymous Auth/PostgREST rejection and 401s from authorization/listing functions.
- Denied flight searches for anonymous, unassigned, ambiguous, and unauthorized
  selections, with zero external provider request attempts.
- Membership revocation immediately blocks subsequent access using the same
  authenticated session, without a new sign-in or token refresh.

The helper and extracted server handlers run inside the framework's real request
and Start contexts. Cookie parsing, the application Supabase server-client factory,
Auth verification, PostgREST requests and response status handling are genuine.
This is not an end-to-end browser test or an HTTP test of TanStack's RPC routing,
wire serialization, CSRF middleware, or deployed proxy behavior. Those boundaries
remain separate integration work.

## Cleanup and interpreting results

Teardown signs out the fixture sessions and deletes only the current run's
memberships, organizations, Auth users and Auth audit records. Foreign-key cascades
remove Auth session/refresh-token records. A privileged count then verifies zero
remaining fixture users, organizations, memberships, sessions, refresh tokens and
audit records. The summary prints counts and PASS status, never cookies or tokens.
It also reports the number of real Auth/PostgREST requests and blocked external
attempts; the expected external-attempt count is zero.

The fixture insert is transactional. Auth signup happens over HTTP, so the entire
suite cannot be wrapped in one rollback. Teardown also handles partially completed
setup; cleanup failure fails the run. A hard-killed process cannot guarantee
teardown. After such an interruption, identify the exact run UUID from the
`Integration A/B <run UUID>` organization names or the
`flight-integration-<run UUID>-...` Auth emails. A privileged local operator must
remove only that run's memberships, organizations, Auth users and matching audit
records, then verify the same zero counts. Never delete by the broad shared prefix
or reset the local database to clean up fixtures.

Do not report a passing unit suite or successful build as evidence of real RLS
verification. Report this integration suite's outcome and its explicit cleanup
result separately. SQL role-simulation tests in `supabase/tests/organizations.sql`
remain complementary coverage for constraints and write permissions.

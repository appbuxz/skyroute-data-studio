# Unified authentication after branch integration

The managed browser client in `src/integrations/supabase/client.ts` owns persistent
sessions and Lovable preview storage. `src/lib/supabase/client.ts` is only a compatibility
export of that same instance. No SSR cookie session remains.

`src/start.ts` attaches the managed bearer token to callable RPCs while preserving
request error handling and CSRF middleware. The `_authenticated` route calls
`getAuthenticatedUser` on the server, then mounts the organization workspace keyed
by verified user ID. `/auth` redirects to `/login`.

The request-scoped server factory accepts only a bearer header and public
publishable/anon configuration. It does not read cookies or use the admin client.
`requireAuth` verifies identity using Auth `getUser`; missing/invalid identity gives
401 and unavailable Auth gives a sanitized 503.

`getOrganizationMemberships` and the single search callable in `search.functions.ts`
verify identity server-side. `requireOrganization` checks current membership with
user-scoped RLS on every search, including explicit browser selections. SerpApi is
called only after successful authorization. The provider interface, analytics and
Travelport normalizer remain unchanged.

Logout cancels and clears private query cache; successful sign-out also clears
legacy search storage. Sign-in/sign-out events clear private query caches; auth events invalidate the router, and the workspace drops
selection/results and invalidates pending requests on user/session changes.
Preview replies require the expected request ID, trusted editor origin and parent
window source. Logout tombstones remove local session copies; blocked local storage
does not prevent broker notification.

Organization migrations remain in `supabase/migrations`; the independent main
profile migration remains in `drizzle/migrations`. It creates only profiles and an
Auth signup trigger/backfill; it does not replace or weaken membership policies.
The Drizzle schema stub is not a declaration of the full database: do not generate
a replacement schema from that empty file. No migrations were run during integration.
The local Supabase config is retained for repeatable integration tests; hosted
configuration is managed separately. Bun is the canonical lockfile used in CI;
the obsolete npm lockfile for the cookie-based dependency graph was removed.

Local unit/integration checks cannot verify the actual Lovable iframe/editor broker,
hosted profile migration state, deployed RPC proxy/CSRF behavior or real provider
availability. These require a separate hosted/browser acceptance check.

# Flight Analytics authentication

## Setup
The supplied brief described existing SSR authentication clients and `requireAuth`, but neither existed in this repository. Lovable Cloud was connected and email/password authentication enabled. The generated persistent browser session and bearer middleware are preserved; no parallel SSR-cookie implementation was introduced. Workspace rendering is client-gated, and the flight-search function independently verifies the caller on the server. Refresh restores the managed session.

Create the first existing-user account under **More → Users → Add user → Create new user**. This flow does not add public signup, password reset, subscriptions, roles or organizations. Private profiles are automatically created with display name, avatar URL and preferences; only the owner can read/update their profile. No profile-editing screen is added.

## Files
- `src/routes/login.tsx`: email/password form, pending/error states, successful navigation to `/search`.
- `src/routes/auth.tsx`: public compatibility redirect to `/login`.
- `src/routes/_authenticated/route.tsx`: verified identity gate; session-aware signed-out redirect.
- `src/routes/_authenticated/_workspace*.tsx`: original workspace layout/pages moved beneath the gate without changing URLs. Search calls the protected function through `useServerFn`.
- `src/routes/__root.tsx`: one identity-change subscription.
- `src/components/layout/app-shell.tsx`: functional sign-out and failure state.
- `src/lib/auth/session.ts` and `.test.ts`: identity verification and ordered cache/session teardown.
- `src/lib/flights/search.functions.ts`: renamed from `search.server.ts`, preserving provider integration and adding server authentication.
- `src/start.ts`: Cloud-generated bearer attacher, preserving error and CSRF middleware.
- `src/test/app-routing.test.tsx`: protected workspace and public login routing checks.
- `src/routes/index.tsx` and workspace pages: complete leaf metadata.
- `drizzle/migrations/0000_private_user_profiles.sql`: profile schema, grants, owner policies, signup trigger and existing-user backfill.
- Cloud generated integration files/dependencies/configuration; `AGENTS.md` and `roadmap.md` document architecture and status.

## Verification limitations
No account existed when session minting was attempted. Successful real-user login, server-recognized search, signed-in refresh, profile ownership and live sign-out must be checked after the first account is created. Unit tests cannot establish hosted session revocation. Live flight data remains unconnected, as before.
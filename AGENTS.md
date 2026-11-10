<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Flight data access goes through the `FlightDataProvider` interface in `src/lib/flights/`; UI never calls data sources directly, so a real API can be swapped in without UI changes.
- Workspace pages live under the pathless `_workspace` layout (sidebar shell); the landing page at `/` has its own nav.
- Data calls accept an optional `organizationId` context to prepare for multi-tenant organizations.
- Nest `_workspace` under the managed `_authenticated` gate while preserving public URLs, so the existing shell stays intact and signed-out users are redirected before content renders.
- Use the generated Cloud client and bearer middleware, plus server-verified identity on private functions; do not introduce parallel SSR cookie sessions because the managed client owns persistent session storage.
- Keep callable server functions in `.functions.ts`, not `.server.ts`, to preserve TanStack's client/server bundling boundary.

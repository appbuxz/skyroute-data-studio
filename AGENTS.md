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

import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { OrganizationWorkspaceProvider } from "@/lib/organizations/workspace-provider";
export const Route = createFileRoute("/_authenticated/_workspace")({ component: Workspace });
function Workspace() {
  const { user } = Route.useRouteContext();
  return (
    <OrganizationWorkspaceProvider key={user.id} userId={user.id}>
      <AppShell>
        <Outlet />
      </AppShell>
    </OrganizationWorkspaceProvider>
  );
}

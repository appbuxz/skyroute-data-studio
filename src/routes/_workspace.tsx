import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { getAuthenticatedUser } from "@/lib/supabase/session.server";
import { OrganizationWorkspaceProvider } from "@/lib/organizations/workspace-provider";

export const Route = createFileRoute("/_workspace")({
  beforeLoad: async () => {
    const user = await getAuthenticatedUser();

    if (!user) {
      throw redirect({ to: "/login" });
    }
    return { userId: user.id };
  },
  component: Workspace,
});

function Workspace() {
  const { userId } = Route.useRouteContext();
  return (
    <OrganizationWorkspaceProvider key={userId} userId={userId}>
      <AppShell>
        <Outlet />
      </AppShell>
    </OrganizationWorkspaceProvider>
  );
}

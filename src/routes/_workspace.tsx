import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_workspace")({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

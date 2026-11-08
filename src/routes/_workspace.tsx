import {
  Outlet,
  createFileRoute,
  redirect,
} from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { getAuthenticatedUser } from "@/lib/supabase/session.server";

export const Route = createFileRoute("/_workspace")({
  beforeLoad: async () => {
    const user = await getAuthenticatedUser();

    if (!user) {
      throw redirect({ to: "/login" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
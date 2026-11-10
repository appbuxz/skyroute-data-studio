import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getAuthenticatedUser } from "@/lib/supabase/session.functions";
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw redirect({ to: "/login", replace: true });
    return { user };
  },
  component: Outlet,
});

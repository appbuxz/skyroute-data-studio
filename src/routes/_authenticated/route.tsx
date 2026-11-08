import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { verifiedUser } from "@/lib/auth/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = await verifiedUser(supabase);
    if (!user) throw redirect({ to: "/auth", replace: true });
    return { user };
  },
  component: Outlet,
});
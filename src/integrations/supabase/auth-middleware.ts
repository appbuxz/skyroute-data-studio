import { createMiddleware } from "@tanstack/react-start";
import { requireAuth } from "@/lib/supabase/auth.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
/** Same bearer identity/RLS client as organization authorization; no parallel sessions. */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const user = await requireAuth();
    return next({ context: { supabase: createSupabaseServerClient(), userId: user.id } });
  },
);

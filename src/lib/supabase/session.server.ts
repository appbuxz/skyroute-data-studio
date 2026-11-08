import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "./server";

export const getAuthenticatedUser = createServerFn({
  method: "GET",
}).handler(async () => {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return { id: data.user.id };
});
import type { SupabaseClient } from "@supabase/supabase-js";

export async function verifiedUser(client: Pick<SupabaseClient, "auth">) {
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export async function terminateSession(
  client: Pick<SupabaseClient, "auth">,
  cache: { cancelQueries: () => Promise<void>; clear: () => void },
) {
  await cache.cancelQueries();
  cache.clear();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
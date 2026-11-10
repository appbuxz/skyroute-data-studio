import "@tanstack/react-start/server-only";
import { createClient } from "@supabase/supabase-js";
import { getRequest, setResponseStatus } from "@tanstack/react-start/server";

/** Request-scoped user client. Never cookies, service-role keys, or shared sessions. */
export function createSupabaseServerClient() {
  const header = getRequest().headers.get("authorization");
  const token = /^Bearer ([^\s,]+)$/.exec(header ?? "")?.[1];
  if (!token) {
    setResponseStatus(401);
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }
  const url = process.env["SUPABASE_URL"] || import.meta.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] || import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  // Reject privileged keys rather than accidentally bypassing tenant RLS.
  let publicKey = key?.startsWith("sb_publishable_") ?? false;
  if (key && !publicKey) {
    try {
      publicKey =
        JSON.parse(atob(key.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))).role === "anon";
    } catch {
      /* invalid key */
    }
  }
  if (!url || !key || !publicKey) {
    setResponseStatus(503);
    throw Object.assign(new Error("Authentication service unavailable"), { statusCode: 503 });
  }
  return createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

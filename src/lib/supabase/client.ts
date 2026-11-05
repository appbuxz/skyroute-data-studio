import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabasePublishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing Supabase browser configuration");
}

export const supabase = createBrowserClient(
  supabaseUrl,
  supabasePublishableKey,
);

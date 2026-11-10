import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const env = loadEnv("integration", process.cwd(), "VITE_SUPABASE_");
const localUrl = new URL(env["VITE_SUPABASE_URL"] ?? "http://invalid");
if (
  localUrl.origin !== "http://127.0.0.1:54321" ||
  localUrl.pathname !== "/" ||
  localUrl.search ||
  localUrl.hash ||
  localUrl.username ||
  localUrl.password
) {
  throw new Error("Integration tests require local Supabase at http://127.0.0.1:54321");
}
const key = env["VITE_SUPABASE_PUBLISHABLE_KEY"];
if (!key) throw new Error("Local Supabase publishable configuration is missing");
if (!key.startsWith("sb_publishable_")) {
  let role: unknown;
  try {
    role = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString()).role;
  } catch {
    throw new Error("Local Supabase key must be publishable or anon");
  }
  if (role !== "anon") throw new Error("Privileged keys are forbidden for authorization tests");
}

export default defineConfig({
  // Override explicitly; never let .env's remote project become a fallback.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(localUrl.origin),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(key),
  },
  test: {
    env: { SUPABASE_URL: localUrl.origin, SUPABASE_PUBLISHABLE_KEY: key },
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 45_000,
  },
});

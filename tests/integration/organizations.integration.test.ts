import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { getResponseStatus, requestHandler } from "@tanstack/react-start/server";
import { runWithStartContext } from "@tanstack/start-storage-context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requireOrganization } from "../../src/lib/organizations/authorization.server";

// Opt-in suite: no mocks. Auth, session verification, joins and RLS use real HTTP.
// Only fixture INSERT/DELETE and cleanup verification use privileged local SQL.
const API = "http://127.0.0.1:54321";
const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
const runId = randomUUID();
const agencyA = randomUUID();
const agencyB = randomUUID();
const unknownAgency = randomUUID();
const agencyNames = { a: `Integration A ${runId}`, b: `Integration B ${runId}` };
const createdUsers: string[] = [];
const sessions: Array<Awaited<ReturnType<typeof register>>> = [];
const originalFetch = globalThis.fetch;
const traffic = { auth: 0, postgrest: 0, blocked: 0 };
let cleanupVerified = false;

type CompiledServerFunction = (options: {
  data?: unknown;
  method: "GET" | "POST";
  context: Record<string, unknown>;
}) => Promise<{ result?: unknown; error?: unknown }>;
let listMemberships: CompiledServerFunction;
let searchFlights: CompiledServerFunction;
let authenticatedUser: CompiledServerFunction;
let alice: Awaited<ReturnType<typeof register>>;
let bob: Awaited<ReturnType<typeof register>>;
let carol: Awaited<ReturnType<typeof register>>;
let dave: Awaited<ReturnType<typeof register>>;

const guardedFetch: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  if (
    url.origin !== API ||
    (!url.pathname.startsWith("/auth/v1/") && !url.pathname.startsWith("/rest/v1/"))
  ) {
    ++traffic.blocked;
    throw new Error("Integration network guard blocked a non-local or unexpected request");
  }
  if (url.pathname.startsWith("/auth/v1/")) ++traffic.auth;
  else ++traffic.postgrest;
  // Never follow a redirect, even from a local service, to an unverified origin.
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  return originalFetch(input, {
    ...init,
    redirect: "error",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(8_000)])
      : AbortSignal.timeout(8_000),
  });
};

function fixtureSql(sql: string): string {
  const user = "postgres";
  try {
    return execFileSync(
      "psql",
      [
        "-X",
        "-w",
        "-h",
        "127.0.0.1",
        "-p",
        "54322",
        "-U",
        user,
        "-d",
        "postgres",
        "--set=ON_ERROR_STOP=1",
        "--set=VERBOSITY=sqlstate",
        "-At",
      ],
      {
        input: sql,
        encoding: "utf8",
        timeout: 15_000,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          // Standard local Supabase development default; never used for HTTP auth.
          PGPASSWORD: process.env["LOCAL_SUPABASE_DB_PASSWORD"] ?? user,
          PGCONNECT_TIMEOUT: "5",
          PGSSLMODE: "disable",
          PGOPTIONS: "-c statement_timeout=10000",
        },
      },
    ).trim();
  } catch {
    // Do not dump child-process arguments, environment or captured SQL on failure.
    throw new Error(
      "Local PostgreSQL fixture operation failed; credentials and SQL output suppressed",
    );
  }
}

function uuidLiteral(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Invalid fixture UUID");
  }
  return `'${id}'`;
}

async function register(label: string) {
  const email = `flight-integration-${runId}-${label}@example.test`;
  const password = `${randomBytes(24).toString("base64url")}Aa9!`;
  const signup = createClient(API, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const registered = await signup.auth.signUp({ email, password });
  // Track the user before any subsequent assertion so partial setup is cleaned.
  if (registered.data.user) createdUsers.push(registered.data.user.id);
  if (registered.error || !registered.data.user) throw new Error("Local Auth signup failed");
  const client = createClient(API, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session)
    throw new Error("Local Auth password sign-in failed");
  return {
    id: registered.data.user.id,
    client,
    bearerToken: () => signedIn.data.session!.access_token,
  };
}

async function builtHandler(exportName: string): Promise<CompiledServerFunction> {
  const directory = resolve(".output/server/_ssr");
  const files = readdirSync(directory).filter((name) => name.endsWith(".mjs"));
  const file = files.find((name) =>
    readFileSync(resolve(directory, name), "utf8").includes(`export { ${exportName} }`),
  );
  if (!file)
    throw new Error("Compiled server function missing; build the current application first");
  // Actual compiler-extracted server functions, not copied handlers or mocks.
  const module = await import(/* @vite-ignore */ pathToFileURL(resolve(directory, file)).href);
  const handler: unknown = module[exportName];
  if (typeof handler !== "function") throw new Error("Compiled server function export is invalid");
  return handler as CompiledServerFunction;
}

async function requestAs(
  session: { bearerToken: () => string } | null,
  action: () => Promise<unknown>,
) {
  const request = new Request("http://127.0.0.1/integration", {
    headers: session ? { authorization: `Bearer ${session.bearerToken()}` } : {},
  });
  // Real TanStack request/bearer/response storage; Supabase clients are untouched.
  const handler = requestHandler(async (currentRequest) =>
    runWithStartContext(
      {
        request: currentRequest,
        startOptions: {},
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set(),
        handlerType: "serverFn",
        getRouter: () => {
          throw new Error("Router rendering is outside this integration suite");
        },
      },
      async () => {
        try {
          const result = await action();
          return Response.json({ result }, { status: getResponseStatus() });
        } catch (failure) {
          const error = failure as { code?: string; message?: string; statusCode?: number };
          return Response.json(
            { error: { code: error.code, message: error.message } },
            {
              status: getResponseStatus(),
            },
          );
        }
      },
    ),
  );
  const response = await handler(request, {});
  return { status: response.status, body: await response.json() };
}

async function execute(fn: CompiledServerFunction, data?: unknown) {
  const response = await fn({ data, context: {}, method: data === undefined ? "GET" : "POST" });
  if (response.error) throw response.error;
  return response.result;
}

beforeAll(async () => {
  if (import.meta.env["VITE_SUPABASE_URL"] !== API)
    throw new Error("Remote Supabase targets are forbidden");
  globalThis.fetch = guardedFetch;
  const builtAt = statSync(".output/server/_ssr/ssr.mjs").mtimeMs;
  for (const source of [
    "src/lib/organizations/session.functions.ts",
    "src/lib/organizations/authorization.server.ts",
    "src/lib/supabase/auth.server.ts",
    "src/lib/supabase/server.ts",
    "src/lib/supabase/session.functions.ts",
    "src/lib/flights/search.functions.ts",
    "src/lib/flights/search-schema.ts",
    "src/lib/flights/types.ts",
  ]) {
    if (statSync(source).mtimeMs > builtAt)
      throw new Error("Build is stale; rebuild before integration testing");
  }
  listMemberships = await builtHandler("getOrganizationMemberships_createServerFn_handler");
  authenticatedUser = await builtHandler("getAuthenticatedUser_createServerFn_handler");
  searchFlights = await builtHandler("searchFlightsServer_createServerFn_handler");
  for (const label of ["alice", "bob", "carol", "dave"]) sessions.push(await register(label));
  [alice, bob, carol, dave] = sessions as [typeof alice, typeof bob, typeof carol, typeof dave];
  fixtureSql(`begin;
    insert into public.organizations (id, name) values
      (${uuidLiteral(agencyA)}, '${agencyNames.a}'), (${uuidLiteral(agencyB)}, '${agencyNames.b}');
    insert into public.organization_members (organization_id, user_id, role) values
      (${uuidLiteral(agencyA)}, ${uuidLiteral(alice.id)}, 'owner'),
      (${uuidLiteral(agencyB)}, ${uuidLiteral(bob.id)}, 'owner'),
      (${uuidLiteral(agencyA)}, ${uuidLiteral(carol.id)}, 'admin'),
      (${uuidLiteral(agencyB)}, ${uuidLiteral(carol.id)}, 'member');
    commit;`);
});

afterAll(async () => {
  try {
    await Promise.allSettled(sessions.map((session) => session.client.auth.signOut()));
    const users = createdUsers.map(uuidLiteral).join(",") || "null";
    const organizations = [agencyA, agencyB].map(uuidLiteral).join(",");
    fixtureSql(`begin;
      delete from public.organization_members where organization_id in (${organizations});
      delete from public.organizations where id in (${organizations});
      delete from auth.users where id in (${users}) and email like 'flight-integration-${runId}-%';
      delete from auth.audit_log_entries
        where payload->>'actor_id' in (${users})
          or payload::text like '%flight-integration-${runId}-%';
      commit;`);
    const remaining = fixtureSql(`select
      (select count(*) from public.organizations where id in (${organizations})) +
      (select count(*) from public.organization_members where organization_id in (${organizations}) or user_id in (${users})) +
      (select count(*) from auth.users where id in (${users}) or email like 'flight-integration-${runId}-%') +
      (select count(*) from auth.sessions where user_id in (${users})) +
      (select count(*) from auth.refresh_tokens where user_id::text in (${users})) +
      (select count(*) from auth.audit_log_entries where payload->>'actor_id' in (${users})
        or payload::text like '%flight-integration-${runId}-%');`);
    cleanupVerified = remaining === "0";
    if (!cleanupVerified)
      throw new Error("Disposable integration fixture cleanup verification failed");
    console.info(
      `Local integration cleanup: PASS; disposable users, organizations, memberships, Auth session and audit records remaining: 0. Auth HTTP requests: ${traffic.auth}; PostgREST HTTP requests: ${traffic.postgrest}; blocked external attempts: ${traffic.blocked}.`,
    );
    expect(traffic.blocked).toBe(0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

describe.sequential("local Supabase organization isolation", () => {
  it("verifies route identity server-side through the bearer transport", async () => {
    const response = await requestAs(alice, () => execute(authenticatedUser));
    expect(response.status).toBe(200);
    expect(response.body.result).toEqual({ id: alice.id });
    const anonymous = await requestAs(null, () => execute(authenticatedUser));
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.result).toBeNull();
  });

  it("genuinely authenticates disposable users through local Auth", async () => {
    const { data, error } = await alice.client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(alice.id);
    expect(traffic.auth).toBeGreaterThan(0);
  });

  it("returns only the caller's own memberships even without an application filter", async () => {
    const { data, error } = await alice.client
      .from("organization_members")
      .select("organization_id, user_id, role");
    expect(error).toBeNull();
    expect(data).toEqual([{ organization_id: agencyA, user_id: alice.id, role: "owner" }]);
  });

  it("blocks explicit attempts to read another user's membership", async () => {
    const { data, error } = await alice.client
      .from("organization_members")
      .select("*")
      .eq("user_id", carol.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("returns actual organization join names and roles through getOrganizationMemberships", async () => {
    const response = await requestAs(carol, () => execute(listMemberships));
    expect(response.status).toBe(200);
    expect(response.body.result).toEqual(
      [
        { organizationId: agencyA, organizationName: agencyNames.a, role: "admin" },
        { organizationId: agencyB, organizationName: agencyNames.b, role: "member" },
      ].sort((a, b) => a.organizationId.localeCompare(b.organizationId)),
    );
  });

  it("lists only one authorized agency, and returns zero for an unassigned user", async () => {
    const single = await requestAs(alice, () => execute(listMemberships));
    expect(single.status).toBe(200);
    expect(single.body.result).toEqual([
      { organizationId: agencyA, organizationName: agencyNames.a, role: "owner" },
    ]);
    const none = await requestAs(dave, () => execute(listMemberships));
    expect(none.status).toBe(200);
    expect(none.body.result).toEqual([]);
  });

  it("blocks reading an organization without membership through PostgREST", async () => {
    const visible = await alice.client.from("organizations").select("id, name");
    expect(visible.error).toBeNull();
    expect(visible.data).toEqual([{ id: agencyA, name: agencyNames.a }]);
    const forbidden = await alice.client.from("organizations").select("id, name").eq("id", agencyB);
    expect(forbidden.error).toBeNull();
    expect(forbidden.data).toEqual([]);
  });

  it("automatically resolves a sole membership with real request bearer token and getUser", async () => {
    const response = await requestAs(alice, () => requireOrganization());
    expect(response.status).toBe(200);
    expect(response.body.result).toEqual({
      userId: alice.id,
      organizationId: agencyA,
      role: "owner",
    });
  });

  it("requires explicit selection for multiple memberships", async () => {
    const response = await requestAs(carol, () => requireOrganization());
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ORGANIZATION_SELECTION_REQUIRED");
  });

  it("authorizes either explicit membership for a multi-organization user", async () => {
    for (const [organizationId, role] of [
      [agencyA, "admin"],
      [agencyB, "member"],
    ]) {
      const response = await requestAs(carol, () => requireOrganization(organizationId));
      expect(response.status).toBe(200);
      expect(response.body.result).toEqual({ userId: carol.id, organizationId, role });
    }
  });

  it("denies inaccessible and nonexistent selections identically without fallback", async () => {
    const forbidden = await requestAs(alice, () => requireOrganization(agencyB));
    const missing = await requestAs(alice, () => requireOrganization(unknownAgency));
    expect(forbidden.status).toBe(403);
    expect(missing).toEqual(forbidden);
    expect(forbidden.body.error.code).toBe("ORGANIZATION_ACCESS_DENIED");
  });

  it("rejects unauthenticated Auth, PostgREST, helper and membership-list requests", async () => {
    const auth = await fetch(`${API}/auth/v1/user`, { headers: { apikey: key } });
    expect(auth.status).toBe(401);
    const anonymous = createClient(API, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const table of ["organizations", "organization_members"]) {
      const response = await anonymous.from(table).select("*");
      expect(response.error?.code).toBe("42501");
      expect(response.data).toBeNull();
    }
    expect((await requestAs(null, () => requireOrganization())).status).toBe(401);
    expect((await requestAs(null, () => execute(listMemberships))).status).toBe(401);
  });

  it.each([
    ["unauthenticated", (): null => null, undefined, 401],
    ["unassigned", (): typeof dave => dave, undefined, 403],
    ["ambiguous", (): typeof carol => carol, undefined, 409],
    ["unauthorized selection", (): typeof alice => alice, (): string => agencyB, 403],
  ] as const)(
    "rejects %s flight searches before any external provider execution",
    async (_label, session, selection, status) => {
      const blockedBefore = traffic.blocked;
      const response = await requestAs(session(), () =>
        execute(searchFlights, {
          origin: "ALA",
          destination: "IST",
          departureDate: "2099-12-10",
          passengers: 1,
          cabinClass: "economy",
          organizationId: selection?.(),
        }),
      );
      expect(response.status).toBe(status);
      expect(traffic.blocked).toBe(blockedBefore);
    },
  );

  it("enforces membership revocation on subsequent queries using the same session", async () => {
    const beforeToken = carol.bearerToken();
    expect((await requestAs(carol, () => requireOrganization(agencyB))).status).toBe(200);
    fixtureSql(`delete from public.organization_members
      where organization_id = ${uuidLiteral(agencyB)} and user_id = ${uuidLiteral(carol.id)};`);
    const revoked = await requestAs(carol, () => requireOrganization(agencyB));
    expect(revoked.status).toBe(403);
    const direct = await carol.client.from("organizations").select("id").eq("id", agencyB);
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([]);
    const listed = await requestAs(carol, () => execute(listMemberships));
    expect(listed.body.result).toEqual([
      { organizationId: agencyA, organizationName: agencyNames.a, role: "admin" },
    ]);
    // Compare booleans so assertion diagnostics cannot print token-bearing bearer token.
    expect(beforeToken === carol.bearerToken()).toBe(true);
    expect(traffic.postgrest).toBeGreaterThan(0);
  });
});

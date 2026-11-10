import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  status: vi.fn(),
  create: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: mocks.request,
  setResponseStatus: mocks.status,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
import { createSupabaseServerClient } from "./server";
import { requireAuth } from "./auth.server";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_fixture");
  mocks.request.mockReturnValue(
    new Request("http://localhost", { headers: { Authorization: "Bearer fixture-user-token" } }),
  );
  mocks.create.mockReturnValue({ auth: { getUser: mocks.getUser } });
  mocks.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("request-scoped bearer identity", () => {
  it("passes the user token, public key and nonpersistent options to an RLS client", async () => {
    expect(await requireAuth()).toEqual({ id: "verified-user" });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledWith("http://127.0.0.1:54321", "sb_publishable_fixture", {
      global: { headers: { Authorization: "Bearer fixture-user-token" } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  });
  it.each([undefined, "Basic value", "Bearer ", "Bearer a,b"])(
    "rejects missing/malformed bearer before creating a client: %s",
    async (header) => {
      mocks.request.mockReturnValue(
        new Request("http://localhost", { headers: header ? { Authorization: header } : {} }),
      );
      await expect(requireAuth()).rejects.toMatchObject({
        statusCode: 401,
        message: "Authentication required",
      });
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("does not authenticate from cookies", async () => {
    mocks.request.mockReturnValue(
      new Request("http://localhost", { headers: { cookie: "session=fixture" } }),
    );
    await expect(requireAuth()).rejects.toMatchObject({ statusCode: 401 });
  });
  it("rejects a service-role/secret key", () => {
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_secret_fixture");
    expect(() => createSupabaseServerClient()).toThrow("Authentication service unavailable");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects stale identity even when Auth returns a user with an error", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "stale" } },
      error: new Error("rejected"),
    });
    await expect(requireAuth()).rejects.toMatchObject({ statusCode: 401 });
  });
  it("does not expose network errors", async () => {
    mocks.getUser.mockRejectedValue(new Error("sensitive transport details"));
    await expect(requireAuth()).rejects.toMatchObject({
      statusCode: 503,
      message: "Authentication service unavailable",
    });
  });
});

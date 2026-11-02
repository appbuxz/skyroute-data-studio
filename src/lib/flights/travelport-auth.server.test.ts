
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTravelportAccessToken } from "./travelport-auth.server";

const fetchMock = vi.fn();

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setupCredentials() {
  vi.stubEnv("TRAVELPORT_CLIENT_ID", "test-client");
  vi.stubEnv("TRAVELPORT_CLIENT_SECRET", "test-secret");
  vi.stubEnv("TRAVELPORT_USERNAME", "test-user");
  vi.stubEnv("TRAVELPORT_PASSWORD", "test-password");
  vi.stubEnv("TRAVELPORT_PCC", "TEST_PCC");
}

describe("Travelport OAuth", () => {
  it("rejects missing credentials without calling API", async () => {
    setupCredentials();
    vi.stubEnv("TRAVELPORT_PASSWORD", "");
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTravelportAccessToken()).rejects.toThrow(
      "Travelport credentials are not configured",
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests and returns an access token", async () => {
    setupCredentials();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "test-jwt" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(getTravelportAccessToken()).resolves.toBe("test-jwt");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.pp.travelport.com/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          client_id: "test-client",
          client_secret: "test-secret",
          username: "test-user",
          password: "test-password",
          grant_type: "password",
        }),
      }),
    );
  });

  it("handles an authentication failure", async () => {
    setupCredentials();

    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(getTravelportAccessToken()).rejects.toThrow(
      "Travelport authentication failed (HTTP 401)",
    );
  });

  it("rejects an invalid token response", async () => {
    setupCredentials();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: "value" }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(getTravelportAccessToken()).rejects.toThrow(
      "Travelport returned an invalid token response",
    );
  });
});

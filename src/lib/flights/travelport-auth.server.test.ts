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
  vi.stubEnv("TRAVELPORT_PCC", "TEST_1G");
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
      json: async () => ({ access_token: "test-jwt", expires_in: 0 }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(getTravelportAccessToken()).resolves.toBe("test-jwt");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.pp.travelport.net/oauth/token",
      expect.objectContaining({
        method: "POST",
        body: new URLSearchParams({
          client_id: "test-client",
          client_secret: "test-secret",
          username: "test-user",
          password: "test-password",
          grant_type: "password",
        }).toString(),
        headers: expect.objectContaining({ "Content-Type": "application/x-www-form-urlencoded" }),
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

it("reuses tokens until expiry and invalidates cache when OAuth credentials change", async () => {
  setupCredentials();
  vi.useFakeTimers();
  try {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "cached-test-token", expires_in: 120 }),
    });
    await getTravelportAccessToken();
    await getTravelportAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    await getTravelportAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.stubEnv("TRAVELPORT_PASSWORD", "changed-test-password");
    await getTravelportAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

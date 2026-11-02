import { afterEach, describe, expect, it, vi } from "vitest";
import { getTravelportCredentials } from "./travelport-config.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Travelport credentials", () => {
  it("returns null when credentials are missing", () => {
    vi.stubEnv("TRAVELPORT_CLIENT_ID", "");
    vi.stubEnv("TRAVELPORT_CLIENT_SECRET", "");
    expect(getTravelportCredentials()).toBeNull();
  });

  it("returns credentials when both values exist", () => {
    vi.stubEnv("TRAVELPORT_CLIENT_ID", "test-client");
    vi.stubEnv("TRAVELPORT_CLIENT_SECRET", "test-secret");
    expect(getTravelportCredentials()).toEqual({
      clientId: "test-client",
      clientSecret: "test-secret",
    });
  });

  it("returns null when one credential is missing", () => {
    vi.stubEnv("TRAVELPORT_CLIENT_ID", "test-client");
    vi.stubEnv("TRAVELPORT_CLIENT_SECRET", "");
    expect(getTravelportCredentials()).toBeNull();
  });
});

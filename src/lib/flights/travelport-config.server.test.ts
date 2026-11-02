
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTravelportCredentials } from "./travelport-config.server";

const validEnv = {
  TRAVELPORT_CLIENT_ID: "test-client",
  TRAVELPORT_CLIENT_SECRET: "test-secret",
  TRAVELPORT_USERNAME: "test-user",
  TRAVELPORT_PASSWORD: "test-password",
  TRAVELPORT_PCC: "TEST_PCC",
};

function setCredentials(
  overrides: Partial<typeof validEnv> = {},
) {
  const env = { ...validEnv, ...overrides };

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Travelport credentials", () => {
  it("returns null when credentials are missing", () => {
    setCredentials({
      TRAVELPORT_CLIENT_ID: "",
      TRAVELPORT_CLIENT_SECRET: "",
    });

    expect(getTravelportCredentials()).toBeNull();
  });

  it("returns all five credentials when configured", () => {
    setCredentials();

    expect(getTravelportCredentials()).toEqual({
      clientId: "test-client",
      clientSecret: "test-secret",
      username: "test-user",
      password: "test-password",
      pcc: "TEST_PCC",
    });
  });

  it.each(Object.keys(validEnv))(
    "returns null when %s is missing",
    (key) => {
      setCredentials({ [key]: "" });
      expect(getTravelportCredentials()).toBeNull();
    },
  );
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { getTravelportCredentials } from "./travelport-config.server";

const validEnv = {
  TRAVELPORT_CLIENT_ID: "test-client",
  TRAVELPORT_CLIENT_SECRET: "test-secret",
  TRAVELPORT_USERNAME: "test-user",
  TRAVELPORT_PASSWORD: "test-password",
  TRAVELPORT_PCC: "TEST_1G",
};

function setCredentials(overrides: Partial<typeof validEnv> = {}) {
  vi.stubEnv("TRAVELPORT_ACCESS_GROUP", "");
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
      pcc: "TEST_1G",
      accessGroup: undefined,
    });
  });

  it.each(Object.keys(validEnv))("returns null when %s is missing", (key) => {
    setCredentials({ [key]: "" });
    expect(getTravelportCredentials()).toBeNull();
  });
});

const group = "00000000-0000-4000-8000-000000000001";
it("accepts Access Group without PCC and gives it precedence", () => {
  setCredentials({ TRAVELPORT_PCC: "" });
  vi.stubEnv("TRAVELPORT_ACCESS_GROUP", group);
  expect(getTravelportCredentials()?.accessGroup).toBe(group);
  vi.stubEnv("TRAVELPORT_PCC", "bare-pcc");
  expect(getTravelportCredentials()?.accessGroup).toBe(group);
});
it("rejects bare PCC and malformed Access Group", () => {
  setCredentials({ TRAVELPORT_PCC: "TEST" });
  expect(getTravelportCredentials()).toBeNull();
  setCredentials();
  vi.stubEnv("TRAVELPORT_ACCESS_GROUP", "bad\r\nheader");
  expect(getTravelportCredentials()).toBeNull();
});

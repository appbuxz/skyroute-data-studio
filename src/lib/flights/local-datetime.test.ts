
import { describe, expect, it } from "vitest";
import { localDateTimeToIso } from "./local-datetime";

describe("localDateTimeToIso", () => {
  it("converts New York winter time", () => {
    expect(
      localDateTimeToIso(
        "2026-12-03",
        "06:05:00",
        "America/New_York",
      ),
    ).toBe("2026-12-03T06:05:00-05:00");
  });

  it("converts Los Angeles winter time", () => {
    expect(
      localDateTimeToIso(
        "2026-12-03",
        "09:15:00",
        "America/Los_Angeles",
      ),
    ).toBe("2026-12-03T09:15:00-08:00");
  });

  it("handles daylight saving time", () => {
    expect(
      localDateTimeToIso(
        "2026-07-03",
        "12:00:00",
        "America/New_York",
      ),
    ).toBe("2026-07-03T12:00:00-04:00");
  });

  it("rejects nonexistent local times", () => {
    expect(() =>
      localDateTimeToIso(
        "2026-03-08",
        "02:30:00",
        "America/New_York",
      ),
    ).toThrow("does not exist");
  });

  it("rejects ambiguous local times", () => {
    expect(() =>
      localDateTimeToIso(
        "2026-11-01",
        "01:30:00",
        "America/New_York",
      ),
    ).toThrow("ambiguous");
  });
});

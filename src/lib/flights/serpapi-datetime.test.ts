import { describe, expect, it } from "vitest";
import { serpApiDateTimeToIso } from "./serpapi-datetime";

describe("SerpApi datetime conversion", () => {
  it("converts Almaty departure time", () => {
    expect(serpApiDateTimeToIso("2026-12-10 12:40", "ALA"))
      .toBe("2026-12-10T12:40:00+05:00");
  });

  it("converts Astana connection time", () => {
    expect(serpApiDateTimeToIso("2026-12-10 17:05", "NQZ"))
      .toBe("2026-12-10T17:05:00+05:00");
  });

  it("converts Istanbul arrival time", () => {
    expect(serpApiDateTimeToIso("2026-12-10 21:05", "IST"))
      .toBe("2026-12-10T21:05:00+03:00");
  });

  it("rejects unknown airports", () => {
    expect(() => serpApiDateTimeToIso("2026-12-10 12:40", "ZZZ"))
      .toThrow("Timezone not configured");
  });

  it("rejects invalid timestamps", () => {
    expect(() => serpApiDateTimeToIso("invalid", "ALA"))
      .toThrow("Invalid SerpApi datetime format");
  });
});

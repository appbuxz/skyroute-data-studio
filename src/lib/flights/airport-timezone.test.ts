import { localDateTimeToIso } from "./local-datetime";

import { describe, expect, it } from "vitest";
import { getAirportTimeZone } from "./airport-timezone";

describe("airport timezone lookup", () => {
  it.each(["ALA", "NQZ", "CIT", "AKX", "GUW", "SCO", "KGF", "UKK"])(
    "supports Kazakhstan airport %s",
    (code) => {
      expect(getAirportTimeZone(code)).toBe("Asia/Almaty");
    },
  );

  it("supports JFK", () => {
    expect(getAirportTimeZone("JFK")).toBe("America/New_York");
  });

  it("supports LAX", () => {
    expect(getAirportTimeZone("LAX")).toBe("America/Los_Angeles");
  });

  it("normalizes lowercase codes", () => {
    expect(getAirportTimeZone("jfk")).toBe("America/New_York");
  });

  it("rejects invalid IATA codes", () => {
    expect(() => getAirportTimeZone("AB")).toThrow();
  });

  it("rejects unknown airports", () => {
    expect(() => getAirportTimeZone("DXB")).toThrow("Timezone not configured for airport: DXB");
  });
});

describe("verified US airport timezones and 2026 DST", () => {
  const cases = [
    ["ONT", "America/Los_Angeles", "-08:00", "-07:00"],
    ["PHX", "America/Phoenix", "-07:00", "-07:00"],
    ["LGA", "America/New_York", "-05:00", "-04:00"],
    ["DFW", "America/Chicago", "-06:00", "-05:00"],
    ["BUR", "America/Los_Angeles", "-08:00", "-07:00"],
    ["CLT", "America/New_York", "-05:00", "-04:00"],
    ["EWR", "America/New_York", "-05:00", "-04:00"],
    ["SNA", "America/Los_Angeles", "-08:00", "-07:00"],
    ["ORD", "America/Chicago", "-06:00", "-05:00"],
    ["BOS", "America/New_York", "-05:00", "-04:00"],
  ] as const;
  it.each(cases)(
    "%s resolves to %s with correct seasonal offsets",
    (code, zone, winter, summer) => {
      expect(getAirportTimeZone(code)).toBe(zone);
      expect(localDateTimeToIso("2026-01-15", "12:00:00", getAirportTimeZone(code))).toBe(
        `2026-01-15T12:00:00${winter}`,
      );
      expect(localDateTimeToIso("2026-07-15", "12:00:00", getAirportTimeZone(code))).toBe(
        `2026-07-15T12:00:00${summer}`,
      );
    },
  );
  it.each(cases.filter(([code]) => code !== "PHX"))("%s rejects DST gaps and overlaps", (code) => {
    expect(() => localDateTimeToIso("2026-03-08", "02:30:00", getAirportTimeZone(code))).toThrow(
      "does not exist",
    );
    expect(() => localDateTimeToIso("2026-11-01", "01:30:00", getAirportTimeZone(code))).toThrow(
      "ambiguous",
    );
  });
  it("Phoenix has no DST gap or overlap", () => {
    expect(localDateTimeToIso("2026-03-08", "02:30:00", getAirportTimeZone("PHX"))).toBe(
      "2026-03-08T02:30:00-07:00",
    );
    expect(localDateTimeToIso("2026-11-01", "01:30:00", getAirportTimeZone("PHX"))).toBe(
      "2026-11-01T01:30:00-07:00",
    );
  });
});

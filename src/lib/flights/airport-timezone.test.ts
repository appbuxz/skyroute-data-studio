
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
    expect(() => getAirportTimeZone("DXB")).toThrow(
      "Timezone not configured for airport: DXB",
    );
  });
});


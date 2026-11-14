import { describe, expect, it } from "vitest";
import { flightSearchSchema } from "./search-schema";
import { flightData } from "./provider";

const valid = {
  origin: "ala",
  destination: "NQZ",
  departureDate: "2026-12-01",
  returnDate: "",
  passengers: "2",
  cabinClass: "economy",
};

describe("flight search validation", () => {
  it("accepts a complete search", () => {
    expect(flightSearchSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects a past departure date", () => {
    expect(
      flightSearchSchema.safeParse({
        ...valid,
        departureDate: "2020-01-01",
      }).success,
    ).toBe(false);
  });

  it("accepts today in Kazakhstan", () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Almaty",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    expect(
      flightSearchSchema.safeParse({
        ...valid,
        departureDate: today,
      }).success,
    ).toBe(true);
  });

  it("accepts a future departure date", () => {
    expect(
      flightSearchSchema.safeParse({
        ...valid,
        departureDate: "2099-12-01",
      }).success,
    ).toBe(true);
  });

  it("requires origin", () => {
    expect(flightSearchSchema.safeParse({ ...valid, origin: "" }).success).toBe(false);
  });
  it("requires departure date", () => {
    expect(flightSearchSchema.safeParse({ ...valid, departureDate: "" }).success).toBe(false);
  });
  it("rejects same origin and destination", () => {
    expect(flightSearchSchema.safeParse({ ...valid, destination: "ALA" }).success).toBe(false);
  });
  it("rejects return before departure", () => {
    expect(flightSearchSchema.safeParse({ ...valid, returnDate: "2026-11-30" }).success).toBe(
      false,
    );
  });
  it("rejects 0 passengers", () => {
    expect(flightSearchSchema.safeParse({ ...valid, passengers: "0" }).success).toBe(false);
  });
});

describe("flight data provider", () => {
  it("reports live search as not connected", async () => {
    const r = await flightData.searchFlights(
      {
        origin: "ALA",
        destination: "NQZ",
        departureDate: "2026-12-01",
        passengers: 1,
        cabinClass: "economy",
      },
      {},
    );
    expect(r.status).toBe("not_connected");
  });
});

it.each(["2099-02-30", "2100-02-29", "2099-13-01", "2099-00-10"])(
  "rejects impossible calendar date %s from localized text entry",
  (departureDate) => {
    const result = flightSearchSchema.safeParse({
      origin: "ALA",
      destination: "IST",
      departureDate,
      passengers: 1,
      cabinClass: "economy",
    });
    expect(result.success).toBe(false);
  },
);


import { describe, expect, it } from "vitest";
import { analyzeFlightPrices } from "./analytics";
import type { FlightOffer } from "./types";

function makeOffer(
  id: string,
  amount: number,
  currency = "KZT",
): FlightOffer {
  return {
    id,
    carrier: "Test Airline",
    flightNumber: "TA100",
    origin: "ALA",
    destination: "IST",
    departureAt: "2026-12-10T10:00:00+05:00",
    arrivalAt: "2026-12-10T14:00:00+03:00",
    stops: 0,
    cabinClass: "economy",
    price: { amount, currency },
  };
}

describe("analyzeFlightPrices", () => {
  it("calculates minimum, maximum and average prices", () => {
    const result = analyzeFlightPrices([
      makeOffer("a", 125000),
      makeOffer("b", 145000),
      makeOffer("c", 110000),
    ]);

    expect(result).not.toBeNull();
    expect(result?.cheapest.id).toBe("c");
    expect(result?.mostExpensive.id).toBe("b");
    expect(result?.averagePrice).toBeCloseTo(126666.67, 2);
    expect(result?.priceSpread).toBe(35000);
    expect(result?.priceSpreadPercent).toBeCloseTo(24.14, 2);
    expect(result?.offerCount).toBe(3);
    expect(result?.currency).toBe("KZT");
  });

  it("returns null for empty offers", () => {
    expect(analyzeFlightPrices([])).toBeNull();
  });

  it("rejects mixed currencies", () => {
    expect(
      analyzeFlightPrices([
        makeOffer("a", 100000, "KZT"),
        makeOffer("b", 200, "USD"),
      ]),
    ).toBeNull();
  });

  it("ignores invalid prices", () => {
    const result = analyzeFlightPrices([
      makeOffer("a", -100),
      makeOffer("b", Number.NaN),
      makeOffer("c", 120000),
    ]);

    expect(result?.offerCount).toBe(1);
    expect(result?.cheapest.id).toBe("c");
    expect(result?.priceSpread).toBe(0);
  });

  it("does not mutate the original offers array", () => {
    const offers = [
      makeOffer("a", 150000),
      makeOffer("b", 100000),
    ];

    analyzeFlightPrices(offers);

    expect(offers.map((offer) => offer.id)).toEqual(["a", "b"]);
  });

  it("handles zero-priced offers without division errors", () => {
    const result = analyzeFlightPrices([
      makeOffer("a", 0),
      makeOffer("b", 0),
    ]);

    expect(result?.priceSpread).toBe(0);
    expect(result?.priceSpreadPercent).toBe(0);
  });
});

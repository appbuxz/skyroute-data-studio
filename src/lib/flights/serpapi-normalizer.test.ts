import { describe, expect, it } from "vitest";
import { normalizeSerpApiFlights } from "./serpapi-normalizer";

const response = {
  search_parameters: { currency: "KZT" },
  best_flights: [
    {
      price: 111290,
      total_duration: 625,
      flights: [
        {
          airline: "Air Astana",
          flight_number: "KC 641",
          duration: 105,
          departure_airport: { id: "ALA", time: "2026-12-10 12:40" },
          arrival_airport: { id: "NQZ", time: "2026-12-10 14:25" },
        },
        {
          airline: "Air Astana",
          flight_number: "KC 917",
          duration: 360,
          departure_airport: { id: "NQZ", time: "2026-12-10 17:05" },
          arrival_airport: { id: "IST", time: "2026-12-10 21:05" },
        },
      ],
    },
  ],
  other_flights: [],
};

describe("SerpApi flight normalizer", () => {
  it("normalizes a connecting flight", () => {
    const offers = normalizeSerpApiFlights(response);
    expect(offers).toHaveLength(1);

    const offer = offers[0]!;
    expect(offer.origin).toBe("ALA");
    expect(offer.destination).toBe("IST");
    expect(offer.stops).toBe(1);
    expect(offer.price).toEqual({ amount: 111290, currency: "KZT" });
    expect(offer.outbound?.segments).toHaveLength(2);
    expect(offer.outbound?.durationMinutes).toBe(625);
    expect(offer.departureAt).toBe("2026-12-10T12:40:00+05:00");
    expect(offer.arrivalAt).toBe("2026-12-10T21:05:00+03:00");
  });

  it("does not invent baggage or refund conditions", () => {
    const offer = normalizeSerpApiFlights(response)[0]!;
    expect(offer.baggage).toBeUndefined();
    expect(offer.refundable).toBeUndefined();
    expect(offer.changeable).toBeUndefined();
  });

  it("rejects a response without currency", () => {
    expect(() => normalizeSerpApiFlights({
      search_parameters: {},
      best_flights: [],
    })).toThrow();
  });

  it("skips malformed offers", () => {
    const offers = normalizeSerpApiFlights({
      search_parameters: { currency: "KZT" },
      best_flights: [{ price: 100, flights: [] }],
      other_flights: [],
    });
    expect(offers).toHaveLength(0);
  });
});

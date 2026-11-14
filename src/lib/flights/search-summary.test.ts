import { describe, expect, it } from "vitest";
import { summarizeAgencySearch } from "./search-summary";
import { groupFlightSchedules } from "./schedule-groups";
import { analyticsSnapshot51, connectingOffer } from "@/test/fixtures/agency-analysis";

describe("agency search summary", () => {
  it("counts the same full routes as analytics and computes independent currency minima", () => {
    const { offers } = analyticsSnapshot51();
    offers.forEach((offer, i) => {
      if (i % 3 === 1) offer.price = { amount: 500 + Math.floor(i / 3) * 5, currency: "USD" };
    });
    const original = structuredClone(offers);
    expect(summarizeAgencySearch(offers)).toEqual({
      offerCount: 51,
      routeCount: groupFlightSchedules(offers).length,
      minimumPrices: [
        { currency: "KZT", amount: 180000 },
        { currency: "USD", amount: 500 },
      ],
    });
    expect(summarizeAgencySearch(offers).routeCount).toBe(3);
    expect(offers).toEqual(original);
  });
  it("preserves zero offers as a valid empty summary", () => {
    expect(summarizeAgencySearch([])).toEqual({ offerCount: 0, routeCount: 0, minimumPrices: [] });
  });
  it("excludes invalid prices without dropping route or offer counts and permits a zero price", () => {
    const prices = [
      { amount: NaN, currency: "KZT" },
      { amount: -1, currency: "USD" },
      { amount: 2, currency: "bad" },
      { amount: 0, currency: "EUR" },
    ];
    const offers = prices.map((price, i) => ({ ...connectingOffer(String(i)), price }));
    expect(summarizeAgencySearch(offers)).toEqual({
      offerCount: 4,
      routeCount: 1,
      minimumPrices: [{ currency: "EUR", amount: 0 }],
    });
  });
});

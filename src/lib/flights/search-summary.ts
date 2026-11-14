import type { FlightOffer } from "./types";
import { groupFlightSchedules } from "./schedule-groups";

/** Counts all returned offers; compares valid prices only within their original currency. */
export function summarizeAgencySearch(offers: FlightOffer[]) {
  const minima = new Map<string, number>();
  for (const { price } of offers) {
    if (!Number.isFinite(price.amount) || price.amount < 0 || !/^[A-Z]{3}$/.test(price.currency))
      continue;
    const existing = minima.get(price.currency);
    minima.set(
      price.currency,
      existing === undefined ? price.amount : Math.min(existing, price.amount),
    );
  }
  return {
    offerCount: offers.length,
    routeCount: groupFlightSchedules(offers).length,
    minimumPrices: [...minima]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => ({ currency, amount })),
  };
}

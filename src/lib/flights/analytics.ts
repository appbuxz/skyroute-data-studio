
import type { FlightOffer } from "./types";

export interface PriceAnalysis {
  currency: string;
  offerCount: number;
  cheapest: FlightOffer;
  mostExpensive: FlightOffer;
  averagePrice: number;
  priceSpread: number;
  priceSpreadPercent: number;
}

export function analyzeFlightPrices(
  offers: FlightOffer[],
): PriceAnalysis | null {
  // Exclude offers with invalid prices or currency codes.
  const valid = offers.filter(
    (offer) =>
      Number.isFinite(offer.price.amount) &&
      offer.price.amount >= 0 &&
      /^[A-Z]{3}$/.test(offer.price.currency),
  );

  const firstOffer = valid[0];

  if (!firstOffer) {
    return null;
  }

  const currency = firstOffer.price.currency;

  // Never compare prices in different currencies.
  if (valid.some((offer) => offer.price.currency !== currency)) {
    return null;
  }

  // Sort a copy without modifying the original array.
  const sorted = [...valid].sort(
    (a, b) => a.price.amount - b.price.amount,
  );

  const cheapest = sorted[0];
  const mostExpensive = sorted[sorted.length - 1];

  if (!cheapest || !mostExpensive) {
    return null;
  }

  const total = sorted.reduce(
    (sum, offer) => sum + offer.price.amount,
    0,
  );

  const averagePrice = total / sorted.length;

  const priceSpread =
    mostExpensive.price.amount - cheapest.price.amount;

  const priceSpreadPercent =
    mostExpensive.price.amount > 0
      ? (priceSpread / mostExpensive.price.amount) * 100
      : 0;

  return {
    currency,
    offerCount: sorted.length,
    cheapest,
    mostExpensive,
    averagePrice,
    priceSpread,
    priceSpreadPercent,
  };
}

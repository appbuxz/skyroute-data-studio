import { CABIN_CLASSES, type FlightOffer, type FlightItinerary } from "./types";

export interface PassengerConfiguration {
  adults: number;
  children: number;
  infants: number;
}

export interface ComparablePriceGroup {
  offers: FlightOffer[];
  currency: string;
  passengers: PassengerConfiguration;
  minimumPrice: number;
  maximumPrice: number;
  potentialPriceDifference: number;
}

function segments(itinerary: FlightItinerary | undefined) {
  if (!itinerary?.segments.length) return null;
  return itinerary.segments.map((s) => [
    s.origin,
    s.destination,
    s.carrier,
    s.flightNumber,
    s.departureAt,
    s.arrivalAt,
  ]);
}

/** Inputs must retain the passenger context of their own search snapshot.
 * Equal known conditions do not prove full fare-rule or bookability equivalence.
 */
export function analyzeComparablePrices(
  entries: Array<{ offer: FlightOffer; passengers: PassengerConfiguration }>,
): ComparablePriceGroup[] {
  const groups = new Map<string, ComparablePriceGroup>();
  for (const { offer, passengers } of entries) {
    const counts = [passengers.adults, passengers.children, passengers.infants];
    if (
      counts.some((n) => !Number.isSafeInteger(n) || n < 0) ||
      passengers.adults < 1 ||
      !Number.isFinite(offer.price.amount) ||
      offer.price.amount < 0 ||
      !/^[A-Z]{3}$/.test(offer.price.currency) ||
      !CABIN_CLASSES.includes(offer.cabinClass)
    )
      continue;
    const outbound = segments(offer.outbound);
    const inbound = segments(offer.inbound);
    // Summary-only offers cannot prove that connecting flight identities match.
    if (!outbound || (offer.inbound && !inbound)) continue;
    const baggage = offer.baggage;
    const key = JSON.stringify([
      outbound,
      inbound,
      offer.origin,
      offer.destination,
      offer.departureAt,
      offer.arrivalAt,
      counts,
      offer.price.currency,
      offer.cabinClass,
      baggage?.checked?.pieces,
      baggage?.checked?.weightKg,
      baggage?.cabin?.pieces,
      baggage?.cabin?.weightKg,
      offer.fareBrand,
      offer.refundable,
      offer.changeable,
    ]);
    const existing = groups.get(key);
    if (existing) {
      existing.offers.push(offer);
      existing.minimumPrice = Math.min(existing.minimumPrice, offer.price.amount);
      existing.maximumPrice = Math.max(existing.maximumPrice, offer.price.amount);
      existing.potentialPriceDifference = existing.maximumPrice - existing.minimumPrice;
    } else {
      groups.set(key, {
        offers: [offer],
        currency: offer.price.currency,
        passengers: { ...passengers },
        minimumPrice: offer.price.amount,
        maximumPrice: offer.price.amount,
        potentialPriceDifference: 0,
      });
    }
  }
  return [...groups.values()].filter((group) => group.offers.length >= 2);
}

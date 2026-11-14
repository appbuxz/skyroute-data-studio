import type { FlightOffer, FlightItinerary } from "./types";

function segmentKey(itinerary: FlightItinerary | undefined) {
  return itinerary?.segments.length
    ? itinerary.segments.map((s) => [
        s.origin,
        s.destination,
        s.carrier,
        s.flightNumber,
        s.departureAt,
        s.arrivalAt,
      ])
    : null;
}

/** Schedule identity deliberately ignores fare conditions and currency.
 * Summary-only connecting offers cannot prove a full itinerary match.
 */
export function groupFlightSchedules(offers: FlightOffer[]) {
  const groups = new Map<string, { key: string; offer: FlightOffer; offers: FlightOffer[] }>();
  offers.forEach((offer, index) => {
    const outbound = segmentKey(offer.outbound);
    const inbound = segmentKey(offer.inbound);
    const incomplete = (!outbound && offer.stops > 0) || (offer.inbound && !inbound);
    const key = JSON.stringify([
      outbound ?? [
        offer.origin,
        offer.destination,
        offer.carrier,
        offer.flightNumber,
        offer.departureAt,
        offer.arrivalAt,
      ],
      inbound,
      offer.origin,
      offer.destination,
      incomplete ? index : null,
    ]);
    const existing = groups.get(key);
    if (existing) existing.offers.push(offer);
    else groups.set(key, { key, offer, offers: [offer] });
  });
  return [...groups.values()];
}

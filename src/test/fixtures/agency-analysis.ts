import type { FlightOffer, OrganizationId } from "@/lib/flights/types";
import type { WorkspaceSearch } from "@/lib/organizations/workspace-context";

export const ANALYTICS_ORG = "f2000000-0000-4000-8000-000000000001" as OrganizationId;
export function connectingOffer(id = "offer-a"): FlightOffer {
  return {
    id,
    carrier: "Air Astana",
    flightNumber: "KC 851",
    origin: "ALA",
    destination: "IST",
    departureAt: "2099-12-10T08:00:00+05:00",
    arrivalAt: "2099-12-10T14:00:00+03:00",
    stops: 1,
    cabinClass: "economy",
    price: { amount: 180000, currency: "KZT" },
    outbound: {
      segments: [
        {
          carrier: "KC",
          flightNumber: "851",
          origin: "ALA",
          destination: "NQZ",
          departureAt: "2099-12-10T08:00:00+05:00",
          arrivalAt: "2099-12-10T09:30:00+05:00",
        },
        {
          carrier: "TK",
          flightNumber: "355",
          origin: "NQZ",
          destination: "IST",
          departureAt: "2099-12-10T11:00:00+05:00",
          arrivalAt: "2099-12-10T14:00:00+03:00",
        },
      ],
    },
  };
}
export function analyticsSnapshot(): WorkspaceSearch {
  const first = connectingOffer();
  const second = connectingOffer("offer-b");
  second.price.amount = 215000;
  const third = connectingOffer("offer-c");
  third.outbound!.segments[0]!.destination = "DXB";
  third.outbound!.segments[1]!.origin = "DXB";
  third.price.amount = 245000;
  return {
    organizationId: ANALYTICS_ORG,
    params: {
      origin: "ALA",
      destination: "IST",
      departureDate: "2099-12-10",
      passengers: 1,
      cabinClass: "economy",
    },
    offers: [first, second, third],
    fetchedAt: "2026-11-14T10:35:00Z",
  };
}

/** 51 fares over three complete itineraries for density and responsive checks. */
export function analyticsSnapshot51(): WorkspaceSearch {
  const snapshot = analyticsSnapshot();
  snapshot.offers = Array.from({ length: 51 }, (_, i) => {
    const offer = structuredClone(snapshot.offers[i % 3]!);
    offer.id = `offer-${i}`;
    offer.price.amount = 180000 + (i % 3) * 30000 + Math.floor(i / 3) * 1500;
    return offer;
  });
  // Keep a third schedule distinct by its second flight's departure time.
  snapshot.offers.forEach((offer, i) => {
    if (i % 3 === 1) offer.outbound!.segments[1]!.departureAt = "2099-12-10T12:00:00+05:00";
  });
  return snapshot;
}

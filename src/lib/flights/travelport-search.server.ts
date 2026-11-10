import type { FlightSearchParams } from "./types";

import { getTravelportAccessToken } from "./travelport-auth.server";
import { getTravelportCredentials } from "./travelport-config.server";

const SEARCH_URL = "https://api.pp.travelport.net/11/air/catalog/search/catalogproductofferings";

export async function searchTravelport(params: FlightSearchParams) {
  if (params.returnDate) throw new Error("Round-trip search is not supported yet");
  const credentials = getTravelportCredentials();

  if (!credentials) {
    throw new Error("Travelport credentials are not configured");
  }

  const token = await getTravelportAccessToken();

  const response = await fetch(SEARCH_URL, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "TVP-PCC-Core": credentials.pcc,
      TraceId: crypto.randomUUID(),
    },
    body: JSON.stringify({
      "@type": "CatalogProductOfferingsQueryRequest",
      CatalogProductOfferingsRequest: {
        "@type": "CatalogProductOfferingsRequestAir",
        maxNumberOfUpsellsToReturn: 4,
        contentSourceList: ["GDS"],
        PassengerCriteria: [
          {
            "@type": "PassengerCriteria",
            number: params.passengers,
            passengerTypeCode: "ADT",
          },
        ],
        SearchCriteriaFlight: [
          {
            "@type": "SearchCriteriaFlight",
            departureDate: params.departureDate,
            From: { value: params.origin },
            To: { value: params.destination },
          },
        ],
        SearchModifiersAir: {
          "@type": "SearchModifiersAir",
          CabinPreference: [
            {
              "@type": "CabinPreference",
              preferenceType: "Permitted",
              cabins: [
                {
                  economy: "Economy",
                  premium_economy: "PremiumEconomy",
                  business: "Business",
                  first: "First",
                }[params.cabinClass],
              ],
            },
          ],
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Travelport search failed (HTTP ${response.status})`);
  }
  const data: unknown = await response.json();

  if (typeof data !== "object" || data === null) {
    throw new Error("Travelport returned an invalid search response");
  }

  return data;
}

// Retain the existing development helper; the application uses searchTravelport.
export function testTravelportSearch() {
  return searchTravelport({
    origin: "JFK",
    destination: "LAX",
    departureDate: "2026-12-03",
    passengers: 1,
    cabinClass: "economy",
  });
}

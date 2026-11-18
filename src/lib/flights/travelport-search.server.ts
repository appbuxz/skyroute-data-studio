import type { FlightSearchParams } from "./types";

import { postTravelportAir } from "./travelport-http.server";

export async function searchTravelport(params: FlightSearchParams, cacheForAirPrice = false) {
  if (params.returnDate) throw new Error("Round-trip search is not supported yet");
  const response = await postTravelportAir("catalog/search/catalogproductofferings", {
    "@type": "CatalogProductOfferingsQueryRequest",
    CatalogProductOfferingsRequest: {
      "@type": "CatalogProductOfferingsRequestAir",
      // Cache the references for AirPrice with an explicit ceiling on catalog offers.
      ...(cacheForAirPrice ? { offersPerPage: 1000 } : {}),
      maxNumberOfUpsellsToReturn: 4,
      contentSourceList: ["GDS"],
      PricingModifiersAir: {
        "@type": "PricingModifiersAir",
        currencyCode: "KZT",
      },
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

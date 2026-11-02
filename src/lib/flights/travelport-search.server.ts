
import { getTravelportAccessToken } from "./travelport-auth.server";
import { getTravelportCredentials } from "./travelport-config.server";

const SEARCH_URL =
  "https://api.pp.travelport.net/11/air/catalog/search/catalogproductofferings";

export async function testTravelportSearch() {
  const credentials = getTravelportCredentials();

  if (!credentials) {
    throw new Error("Travelport credentials are not configured");
  }

  const token = await getTravelportAccessToken();

  const response = await fetch(SEARCH_URL, {
    method: "POST",
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
            number: 1,
            passengerTypeCode: "ADT",
          },
        ],
        SearchCriteriaFlight: [
          {
            "@type": "SearchCriteriaFlight",
            departureDate: "2026-12-03",
            From: { value: "JFK" },
            To: { value: "LAX" },
          },
        ],
        SearchModifiersAir: {
          "@type": "SearchModifiersAir",
          CarrierPreference: [
            {
              "@type": "CarrierPreference",
              preferenceType: "Preferred",
              carriers: ["AA"],
            },
          ],
        },
      },
    }),
  });

if (!response.ok) {
  const errorText = await response.text();

  let errorCode = "unknown";
  let errorMessage = "No error details";

  try {
    const error = JSON.parse(errorText) as {
      error?: string;
      error_description?: string;
      message?: string;
    };

    errorCode = error.error ?? "unknown";
    errorMessage =
      error.error_description ??
      error.message ??
      "No error details";
  } catch {
    // Do not print unstructured responses or sensitive headers.
  }

  throw new Error(
    `Travelport search HTTP ${response.status}; ` +
    `code: ${errorCode}; message: ${errorMessage.slice(0, 200)}`,
  );
}
  const data: unknown = await response.json();

  if (typeof data !== "object" || data === null) {
    throw new Error("Travelport returned an invalid search response");
  }

  return data;
}

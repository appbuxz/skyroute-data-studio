
import type {
  FlightDataProvider,
  FlightSearchResult,
} from "./types";
import { normalizeSerpApiFlights } from "./serpapi-normalizer";

const SERPAPI_URL = "https://serpapi.com/search.json";
const REQUEST_TIMEOUT_MS = 12_000;

const TRAVEL_CLASS = {
  economy: "1",
  premium_economy: "2",
  business: "3",
  first: "4",
} as const;

export const serpApiProvider: FlightDataProvider = {
  async searchFlights(params): Promise<FlightSearchResult> {
const apiKey = process.env["SERPAPI_API_KEY"];

    if (!apiKey) {
      return {
        status: "not_connected",
        message: "Flight search API is not configured.",
      };
    }

    // Round-trip responses require separate handling.
    // Do not represent outbound-only offers as round trips.
    if (params.returnDate) {
      return {
        status: "error",
        message: "Round-trip search is not supported yet.",
      };
    }

    console.log("Flight search outbound date:", params.departureDate);
    const query = new URLSearchParams({
      engine: "google_flights",
      departure_id: params.origin,
      arrival_id: params.destination,
      outbound_date: params.departureDate,
      type: "2",
      adults: String(params.passengers),
      travel_class: TRAVEL_CLASS[params.cabinClass],
      currency: "KZT",
      hl: "en",
      api_key: apiKey,
    });

    try {
      const response = await fetch(
        `${SERPAPI_URL}?${query.toString()}`,
        {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );

     if (!response.ok) {
  const errorBody: unknown = await response.json().catch(() => null);

  const providerMessage =
    typeof errorBody === "object" &&
    errorBody !== null &&
    "error" in errorBody &&
    typeof errorBody.error === "string"
      ? errorBody.error
      : "No error details provided";

  console.error("SerpApi HTTP error:", response.status, providerMessage);

  return {
    status: "error",
    message: "Flight data provider is unavailable.",
  };
}

      const payload: unknown = await response.json();

      if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload)
      ) {
        throw new Error("Invalid provider response");
      }

      if ("error" in payload) {
        console.error("SerpApi returned an API error");

        return {
          status: "error",
          message: "Flight search provider rejected the request.",
        };
      }

      const offers = normalizeSerpApiFlights(
        payload,
        params.cabinClass,
      );

      console.log("SerpApi normalized offers:", offers.length);
      return {
        status: "ok",
        offers,
  fetchedAt: new Date().toISOString(),
      };
    } catch (error) {
      // Never log the request URL: it contains the API key.
      console.error(
        "SerpApi request failed:",
        error instanceof Error ? error.name : "Unknown error",
      );

      return {
        status: "error",
        message: "Flight search is temporarily unavailable.",
      };
    }
  },
};

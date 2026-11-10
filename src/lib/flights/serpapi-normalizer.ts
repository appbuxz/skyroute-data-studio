import type { CabinClass, FlightOffer } from "./types";
import { serpApiDateTimeToIso } from "./serpapi-datetime";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Invalid string field");
  }
  return value;
}

function normalizeOffer(
  value: unknown,
  index: number,
  currency: string,
  cabinClass: CabinClass,
): FlightOffer {
  if (!isRecord(value) || !Array.isArray(value["flights"]) || value["flights"].length === 0) {
    throw new Error("Invalid flight offer");
  }

  const segments = value["flights"].map((item) => {
    if (!isRecord(item) || !isRecord(item["departure_airport"]) ||
        !isRecord(item["arrival_airport"])) {
      throw new Error("Invalid flight segment");
    }

    const origin = readString(item["departure_airport"]["id"]);
    const destination = readString(item["arrival_airport"]["id"]);
    const flightNumber = readString(item["flight_number"]);

    return {
      carrier: readString(item["airline"]),
      flightNumber,
      origin,
      destination,
      departureAt: serpApiDateTimeToIso(
        readString(item["departure_airport"]["time"]), origin,
      ),
      arrivalAt: serpApiDateTimeToIso(
        readString(item["arrival_airport"]["time"]), destination,
      ),
      ...(typeof item["duration"] === "number" ? { durationMinutes: item["duration"] } : {}),
    };
  });

  if (typeof value["price"] !== "number" ||
      !Number.isFinite(value["price"]) || value["price"] < 0) {
    throw new Error("Invalid flight price");
  }

  const first = segments[0]!;
  const last = segments[segments.length - 1]!;

  return {
    id: `serpapi-${index}-${segments.map(s => s.flightNumber).join("-")}`,
    carrier: first.carrier,
    flightNumber: first.flightNumber,
    origin: first.origin,
    destination: last.destination,
    departureAt: first.departureAt,
    arrivalAt: last.arrivalAt,
    stops: segments.length - 1,
    cabinClass,
    price: { amount: value["price"], currency },
    outbound: {
      segments,
      ...(typeof value["total_duration"] === "number"
        ? { durationMinutes: value["total_duration"] }
        : {}),
    },
    provider: "serpapi",
  };
}

export function normalizeSerpApiFlights(
  response: unknown,
  cabinClass: CabinClass = "economy",
): FlightOffer[] {
  if (!isRecord(response) || !isRecord(response["search_parameters"])) {
    throw new Error("Invalid SerpApi response");
  }

  const currency = readString(response["search_parameters"]["currency"]).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Invalid currency");
  }

  const best = Array.isArray(response["best_flights"]) ? response["best_flights"] : [];
  const other = Array.isArray(response["other_flights"]) ? response["other_flights"] : [];

  return [...best, ...other].flatMap((item, index) => {
    try {
      return [normalizeOffer(item, index, currency, cabinClass)];
    } catch (error) {
      console.warn(`SerpApi offer ${index} skipped:`, error instanceof Error ? error.message : error);
      return [];
    }
  });
}

import { compareFlightCheck, flightCheckSchema, type FlightCheckResult } from "./flight-check";
import type { FlightDataProvider, OrganizationId } from "./types";

/** Internal service: caller must authorize organization context before entering provider code. */
export async function runFlightCheck(
  rawInput: unknown,
  provider: FlightDataProvider,
  context: { organizationId: OrganizationId },
): Promise<FlightCheckResult> {
  const input = flightCheckSchema.parse(rawInput);
  const searchedAt = new Date().toISOString();
  try {
    const search = await provider.searchFlights(
      {
        origin: input.origin,
        destination: input.destination,
        departureDate: input.departureDate,
        returnDate: input.returnDate || undefined,
        passengers: input.passengers,
        cabinClass: input.cabinClass,
      },
      context,
    );
    if (search.status === "ok") {
      // Search filters do not verify offer pricing or baggage scope. Preserve unknown evidence.
      return compareFlightCheck(
        input,
        search.offers.map((offer) => ({ ...offer.comparisonEvidence, offer })),
        {
          searchedAt: search.fetchedAt,
          environment: search.environment ?? "unknown",
        },
      );
    }
  } catch {
    // Do not expose provider payloads or credentials.
  }
  const result = compareFlightCheck(input, [], { searchedAt, environment: "unknown" });
  return {
    ...result,
    status: "search_failed",
    limitations: [
      ...result.limitations,
      "Flight search is unavailable or the requested itinerary is unsupported.",
    ],
  };
}

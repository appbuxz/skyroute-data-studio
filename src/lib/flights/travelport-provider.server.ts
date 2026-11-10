import type { FlightDataProvider } from "./types";
import { getTravelportCredentials } from "./travelport-config.server";
import { searchTravelport } from "./travelport-search.server";
import { normalizeTravelportFlights } from "./travelport-normalizer";

export const travelportProvider: FlightDataProvider = {
  async searchFlights(params) {
    if (!getTravelportCredentials()) {
      return {
        status: "not_connected",
        message: "Travelport flight search API is not configured.",
      };
    }
    if (params.returnDate) {
      return { status: "error", message: "Round-trip search is not supported yet." };
    }
    try {
      const result = normalizeTravelportFlights(await searchTravelport(params));
      // Never turn an unsupported response into a misleading empty successful search.
      if (result.skipped.length > 0) {
        return { status: "error", message: "Travelport returned unsupported flight offers." };
      }
      return { status: "ok", offers: result.offers, fetchedAt: new Date().toISOString() };
    } catch {
      return { status: "error", message: "Flight search is temporarily unavailable." };
    }
  },
};

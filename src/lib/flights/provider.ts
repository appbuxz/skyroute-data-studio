import type { FlightDataProvider } from "./types";

/**
 * Placeholder provider: no live flight data source is connected yet.
 * Swap this for a real implementation (e.g. a server function backed by a GDS/NDC API)
 * without touching UI components.
 */
export const notConnectedProvider: FlightDataProvider = {
  async searchFlights() {
    return {
      status: "not_connected",
      message: "Live flight search is not connected yet. No real fares or availability are shown.",
    };
  },
};

export const flightData: FlightDataProvider = notConnectedProvider;

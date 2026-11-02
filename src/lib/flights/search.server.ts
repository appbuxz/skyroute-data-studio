import { createServerFn } from "@tanstack/react-start";
import { flightSearchSchema } from "./search-schema";
import { flightData } from "./provider";
import type { FlightSearchResult } from "./types";

export const searchFlightsServer = createServerFn({ method: "POST" })
  .validator(flightSearchSchema)
  .handler(async ({ data }): Promise<FlightSearchResult> => {
    try {
      return await flightData.searchFlights(
        {
          ...data,
          returnDate: data.returnDate || undefined,
        },
        {},
      );
    } catch (error) {
      console.error("Flight search failed:", error);

      return {
        status: "error",
        message: "Flight search is temporarily unavailable.",
      };
    }
  });

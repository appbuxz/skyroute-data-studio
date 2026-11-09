import { createServerFn } from "@tanstack/react-start";
import { requireOrganization } from "../organizations/authorization.server";
import { flightSearchSchema } from "./search-schema";
import { serpApiProvider } from "./serpapi-provider.server";
import type { FlightSearchResult } from "./types";

export const searchFlightsServer = createServerFn({ method: "POST" })
  .validator(flightSearchSchema)
  .handler(async ({ data }): Promise<FlightSearchResult> => {
    // Keep access failures outside provider error handling. Multiple memberships
    // require a selection flow, which is outside this backend-only phase.
    const { organizationId } = await requireOrganization();

    try {
      return await serpApiProvider.searchFlights(
        {
          ...data,
          returnDate: data.returnDate || undefined,
        },
        { organizationId },
      );
    } catch (error) {
      console.error("Flight search failed:", error);

      return {
        status: "error",
        message: "Flight search is temporarily unavailable.",
      };
    }
  });

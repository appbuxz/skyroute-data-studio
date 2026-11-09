import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrganization } from "../organizations/authorization.server";
import { flightSearchSchema } from "./search-schema";
import { serpApiProvider } from "./serpapi-provider.server";
import type { FlightSearchResult } from "./types";

// Retain the existing flat search contract and every flight-field refinement.
const flightSearchRequestSchema = flightSearchSchema.and(
  z.object({ organizationId: z.string().uuid().optional() }),
);

export const searchFlightsServer = createServerFn({ method: "POST" })
  .validator(flightSearchRequestSchema)
  .handler(async ({ data }): Promise<FlightSearchResult> => {
    const { organizationId: requestedOrganizationId, ...params } = data;
    // Selection is only a hint: resolve membership before entering provider code.
    const { organizationId } = await requireOrganization(requestedOrganizationId);

    try {
      return await serpApiProvider.searchFlights(
        {
          ...params,
          returnDate: params.returnDate || undefined,
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

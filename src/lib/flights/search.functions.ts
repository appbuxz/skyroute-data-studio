import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrganization } from "../organizations/authorization.server";
import { requireAuth } from "../supabase/auth.server";
import { flightSearchSchema } from "./search-schema";
import { travelportProvider } from "./travelport-provider.server";
import type { FlightSearchResult, OrganizationId } from "./types";

// Retain the existing flat search contract and every flight-field refinement.
const flightSearchRequestSchema = flightSearchSchema.and(
  z.object({ organizationId: z.string().uuid().optional() }),
);

export const searchFlightsServer = createServerFn({ method: "POST" })
  .validator(flightSearchRequestSchema)
  .handler(async ({ data }): Promise<FlightSearchResult> => {
    const { organizationId: requestedOrganizationId, ...params } = data;
    // No organization means a personal search, never an implicit agency selection.
    // Explicit agency searches still require current, server-verified membership.
    let organizationId: OrganizationId | undefined;
    if (requestedOrganizationId === undefined) {
      await requireAuth();
    } else {
      ({ organizationId } = await requireOrganization(requestedOrganizationId));
    }

    try {
      return await travelportProvider.searchFlights(
        {
          ...params,
          returnDate: params.returnDate || undefined,
        },
        organizationId ? { organizationId } : {},
      );
    } catch (error) {
      console.error("Flight search failed");

      return {
        status: "error",
        message: "Flight search is temporarily unavailable.",
      };
    }
  });

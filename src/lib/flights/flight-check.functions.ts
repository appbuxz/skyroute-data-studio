import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrganization } from "../organizations/authorization.server";
import { flightCheckSchema } from "./flight-check";
import { runFlightCheck } from "./flight-check.server";
import { travelportProvider } from "./travelport-provider.server";

export const checkFlightServer = createServerFn({ method: "POST" })
  .validator(flightCheckSchema.and(z.object({ organizationId: z.string().uuid().optional() })))
  .handler(async ({ data }) => {
    const { organizationId: requestedOrganizationId, ...input } = data;
    const { organizationId } = await requireOrganization(requestedOrganizationId);
    return runFlightCheck(input, travelportProvider, { organizationId });
  });

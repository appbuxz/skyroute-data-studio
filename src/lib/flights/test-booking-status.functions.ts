import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePriceScope } from "./flight-price-scope.server";

const airport = z.string().regex(/^[A-Z]{3}$/);
const flight = z.object({
  from: airport,
  to: airport,
  carrier: z.string().regex(/^[A-Z0-9]{2}$/),
  flightNumber: z.string().regex(/^\d{1,4}[A-Z]?$/),
  departureDate: z.string().date(),
});

export const getTestBookingStatusServer = createServerFn({ method: "POST" })
  .validator(z.object({ flight, organizationId: z.string().uuid().optional() }))
  .handler(async ({ data }) => {
    const scope = await requirePriceScope(data.organizationId);
    const { retrieveTestBooking } = await import("./test-booking-status.server");
    return retrieveTestBooking(scope, data.flight);
  });

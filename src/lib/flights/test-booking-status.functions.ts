import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePriceScope } from "./flight-price-scope.server";
import { testBookingFlightSchema } from "./test-booking-flight";

export const getTestBookingStatusServer = createServerFn({ method: "POST" })
  .validator(
    z.union([
      z.object({ flight: testBookingFlightSchema, organizationId: z.string().uuid().optional() }),
      z.object({
        bookingId: z.string().regex(/^[0-9a-f]{64}$/),
        organizationId: z.string().uuid().optional(),
      }),
    ]),
  )
  .handler(async ({ data }) => {
    if ("bookingId" in data) {
      const scope = await requirePriceScope(data.organizationId);
      const { retrieveSavedTestBooking } = await import("./test-booking-status.server");
      return retrieveSavedTestBooking(scope, data.bookingId);
    }
    const scope = await requirePriceScope(data.organizationId);
    const { retrieveTestBooking } = await import("./test-booking-status.server");
    return retrieveTestBooking(scope, data.flight);
  });

export const listMyTestBookingsServer = createServerFn({ method: "POST" }).handler(async () => {
  const scope = await requirePriceScope();
  const { listSavedTestBookings } = await import("./test-booking-status.server");
  return listSavedTestBookings(scope);
});

export const listAgencyTestBookingsServer = createServerFn({ method: "POST" })
  .validator(z.object({ organizationId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const scope = await requirePriceScope(data.organizationId);
    const { listSavedTestBookings } = await import("./test-booking-status.server");
    return listSavedTestBookings(scope);
  });

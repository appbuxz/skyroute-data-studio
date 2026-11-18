import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePriceScope } from "./flight-price-scope.server";
import { testBookingFlightSchema } from "./test-booking-flight";

export const getTestBookingStatusServer = createServerFn({ method: "POST" })
  .validator(
    z.union([
      z.object({ flight: testBookingFlightSchema, organizationId: z.string().uuid().optional() }),
      z.object({ bookingId: z.string().regex(/^[0-9a-f]{64}$/) }),
    ]),
  )
  .handler(async ({ data }) => {
    if ("bookingId" in data) {
      const { userId } = await requirePriceScope();
      const { retrieveMyTestBooking } = await import("./test-booking-status.server");
      return retrieveMyTestBooking(userId, data.bookingId);
    }
    const scope = await requirePriceScope(data.organizationId);
    const { retrieveTestBooking } = await import("./test-booking-status.server");
    return retrieveTestBooking(scope, data.flight);
  });

export const listMyTestBookingsServer = createServerFn({ method: "POST" }).handler(async () => {
  const { userId } = await requirePriceScope();
  const { listMyTestBookings } = await import("./test-booking-status.server");
  return listMyTestBookings(userId);
});

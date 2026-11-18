import { z } from "zod";

const airport = z.string().regex(/^[A-Z]{3}$/);
export const testBookingFlightSchema = z.object({
  from: airport,
  to: airport,
  carrier: z.string().regex(/^[A-Z0-9]{2}$/),
  flightNumber: z.string().regex(/^\d{1,4}[A-Z]?$/),
  departureDate: z.string().date(),
});

export type TestBookingFlight = z.infer<typeof testBookingFlightSchema>;

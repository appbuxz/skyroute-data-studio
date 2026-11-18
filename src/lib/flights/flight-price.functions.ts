import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrganization } from "../organizations/authorization.server";
import { requireAuth } from "../supabase/auth.server";
import { confirmTravelportPrice } from "./travelport-price.server";

const organizationIdSchema = z.string().uuid().optional();
const tokenSchema = z.string().min(1).max(2048);

async function requirePriceScope(organizationId?: string) {
  return organizationId === undefined
    ? { userId: (await requireAuth()).id }
    : await requireOrganization(organizationId);
}

export const confirmFlightPriceServer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      checkoutToken: tokenSchema,
      organizationId: organizationIdSchema,
    }),
  )
  .handler(async ({ data }) => {
    const scope = await requirePriceScope(data.organizationId);
    return confirmTravelportPrice(data.checkoutToken, scope);
  });

const testName = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[A-Za-z]+(?:[ -][A-Za-z]+)*$/);

export const createFlightTestBookingServer = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bookingToken: tokenSchema,
      organizationId: organizationIdSchema,
      passenger: z.object({ given: testName, surname: testName }),
    }),
  )
  .handler(async ({ data }) => {
    const scope = await requirePriceScope(data.organizationId);
    const { createTravelportTestBooking } = await import("./travelport-booking.server");
    return createTravelportTestBooking(data.bookingToken, scope, data.passenger);
  });

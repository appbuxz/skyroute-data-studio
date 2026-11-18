import type { TestBookingFlight } from "./test-booking-flight";
import type { PriceScope } from "./travelport-price.server";

export async function testBookingKey(
  routing: string | undefined,
  scope: PriceScope,
  flight: TestBookingFlight,
) {
  // Keep the original key format so existing bookings can be recovered.
  const key = JSON.stringify([
    routing,
    scope.userId,
    scope.organizationId,
    flight.carrier,
    flight.flightNumber,
    flight.departureDate,
    flight.from,
    flight.to,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

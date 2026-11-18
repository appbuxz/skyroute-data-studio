import { z } from "zod";
import { supabaseAdmin } from "../../integrations/supabase/client.server";
import { openCheckout } from "./travelport-checkout-token.server";
import { getTravelportCredentials, testBookingEnabled } from "./travelport-config.server";
import { postTravelportAir } from "./travelport-http.server";
import { testBookingKey } from "./test-booking-key.server";
import type { PriceScope } from "./travelport-price.server";
import type { FlightTestBooking } from "./types";

const resultSchema = z.object({
  Result: z.object({ Error: z.array(z.unknown()).optional() }).optional(),
});
const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const pnrSchema = z.string().regex(/^[A-Z0-9]{6}$/);

async function bookingStep<T>(path: string, body: object, wrapper: string, schema: z.ZodType<T>) {
  const response = await postTravelportAir(path, body);
  if (!response.ok) throw new Error("Travelport booking step failed");
  const result = z.object({ [wrapper]: resultSchema.and(schema) }).parse(await response.json())[
    wrapper
  ]!;
  if (result.Result?.Error?.length) throw new Error("Travelport rejected booking step");
  return result;
}

export async function createTravelportTestBooking(
  token: string,
  scope: PriceScope,
  passenger: { given: string; surname: string },
): Promise<FlightTestBooking> {
  if (!testBookingEnabled()) return { status: "unavailable" };
  const checkout = await openCheckout(token);
  const credentials = getTravelportCredentials();
  if (
    !checkout?.booking ||
    !credentials ||
    checkout.userId !== scope.userId ||
    checkout.organizationId !== scope.organizationId ||
    checkout.expiresAt <= Date.now()
  ) {
    return { status: "unavailable" };
  }
  const flight = checkout.booking;
  const attemptKey = await testBookingKey(
    credentials.accessGroup ?? credentials.pcc,
    scope,
    flight,
  );
  let commitStarted = false;
  let claimed = false;
  try {
    const table = () => supabaseAdmin.from("flight_test_booking_attempts");
    const claim = await table().insert({ attempt_key: attemptKey });
    if (claim.error?.code === "23505") {
      const existing = await table().select("pnr").eq("attempt_key", attemptKey).single();
      const pnr = pnrSchema.safeParse(existing.data?.pnr);
      return pnr.success ? { status: "booked", pnr: pnr.data } : { status: "unknown" };
    }
    if (claim.error) return { status: "error" };
    claimed = true;

    const workbench = await bookingStep(
      "book/session/reservationworkbench",
      { ReservationID: {} },
      "ReservationResponse",
      z.object({ Reservation: z.object({ Identifier: z.object({ value: identifier }) }) }),
    );
    const id = workbench.Reservation.Identifier.value;
    await bookingStep(
      `book/airoffer/reservationworkbench/${id}/offers/buildfromproducts`,
      {
        OfferQueryBuildFromProducts: {
          BuildFromProductsRequest: {
            "@type": "BuildFromProductsRequestAir",
            PassengerCriteria: [{ number: 1, passengerTypeCode: "ADT" }],
            PricingModifiersAir: {
              "@type": "PricingModifiersAir",
              currencyCode: checkout.searchPrice.currency,
            },
            ProductCriteriaAir: [{ SpecificFlightCriteria: [{ ...flight, segmentSequence: 1 }] }],
          },
        },
      },
      "OfferListResponse",
      z.object({ OfferID: z.tuple([z.object({ Identifier: z.object({ value: identifier }) })]) }),
    );
    await bookingStep(
      `book/traveler/reservationworkbench/${id}/travelers`,
      {
        Traveler: {
          "@type": "Traveler",
          passengerTypeCode: "ADT",
          birthDate: "1990-01-01",
          gender: "Male",
          PersonName: {
            "@type": "PersonNameDetail",
            Given: passenger.given,
            Surname: passenger.surname,
          },
          Telephone: [
            {
              "@type": "Telephone",
              countryAccessCode: "1",
              areaCityCode: "202",
              phoneNumber: "5550148",
              role: "Office",
            },
          ],
          Email: [{ value: "booking-test@example.invalid" }],
        },
      },
      "TravelerResponse",
      z.object({}),
    );
    if (checkout.expiresAt <= Date.now()) throw new Error("Booking token expired");
    commitStarted = true;
    const committed = await bookingStep(
      `book/reservation/reservations/${id}`,
      {
        ReservationQueryCommitReservation: {
          enableTwoStepCommitInd: true,
          overrideMCTInd: false,
          errorWhenScheduleChangesInd: true,
          errorWhenOfferPriceChangesInd: true,
        },
      },
      "ReservationResponse",
      z.object({
        Reservation: z.object({
          Receipt: z.array(
            z.object({
              Confirmation: z
                .object({
                  Locator: z.object({ source: z.string(), value: z.string() }),
                })
                .optional(),
            }),
          ),
        }),
      }),
    );
    const locators = committed.Reservation.Receipt.flatMap((receipt) => {
      const locator = receipt.Confirmation?.Locator;
      return locator && ["1G", "1V", "Travelport"].includes(locator.source) ? [locator.value] : [];
    });
    const uniqueLocators = [...new Set(locators)];
    const pnr = pnrSchema.safeParse(uniqueLocators.length === 1 && uniqueLocators[0]);
    if (!pnr.success) return { status: "unknown" };
    try {
      await table().update({ pnr: pnr.data }).eq("attempt_key", attemptKey);
    } catch {
      // The original claim still prevents a duplicate if storing the locator fails.
    }
    return { status: "booked", pnr: pnr.data };
  } catch {
    if (commitStarted) return { status: "unknown" };
    if (claimed) {
      try {
        await supabaseAdmin
          .from("flight_test_booking_attempts")
          .delete()
          .eq("attempt_key", attemptKey);
      } catch {
        // A claim that cannot be released remains closed to prevent duplicate submission.
      }
    }
    return { status: "error" };
  }
}

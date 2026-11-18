import { z } from "zod";
import { supabaseAdmin } from "../../integrations/supabase/client.server";
import { testBookingFlightSchema, type TestBookingFlight } from "./test-booking-flight";
import { testBookingKey } from "./test-booking-key.server";
import { getTravelportCredentials } from "./travelport-config.server";
import { getTravelportAir } from "./travelport-http.server";
import type { PriceScope } from "./travelport-price.server";

const locatorSchema = z.string().regex(/^[A-Z0-9]{6}$/);
const ticketingTerms = z.object({
  PaymentTimeLimit: z.string().datetime({ offset: true }).optional(),
  ExpiryDate: z.string().datetime({ offset: true }).optional(),
});
const ticketDocument = z.object({
  "@type": z.enum(["DocumentTicket", "DocumentTicketExchange"]),
  Number: z.string().regex(/^\d{13}$/),
  historicInd: z.boolean().optional(),
});
const reservationResponse = z.object({
  ReservationResponse: z.object({
    Result: z.object({ Error: z.array(z.unknown()).optional() }).optional(),
    Reservation: z.object({
      Offer: z
        .array(
          z.object({
            TermsAndConditionsFull: z.array(z.unknown()).optional(),
          }),
        )
        .optional(),
      Receipt: z.array(
        z.object({
          "@type": z.string().optional(),
          Document: z.unknown(),
          Confirmation: z
            .object({
              Locator: z.object({ value: z.string() }).optional(),
              OfferStatus: z
                .object({
                  StatusAir: z.array(z.object({ code: z.string(), value: z.string().optional() })),
                })
                .optional(),
            })
            .optional(),
        }),
      ),
    }),
  }),
});

export type TestBookingStatus =
  | { status: "not_found" | "error" }
  | { status: "provider_error"; pnr: string }
  | {
      status: "retrieved";
      pnr: string;
      bookingStatus: string;
      ticketingDeadline?: string;
      ticketNumbers?: string[];
    };

export async function retrieveTestBooking(
  scope: PriceScope,
  flight: TestBookingFlight,
): Promise<TestBookingStatus> {
  const credentials = getTravelportCredentials();
  if (!credentials) return { status: "error" };

  let pnr: string;
  try {
    const attemptKey = await testBookingKey(
      credentials.accessGroup ?? credentials.pcc,
      scope,
      flight,
    );
    const attempts = () => supabaseAdmin.from("flight_test_booking_attempts");
    const { data, error } = await attempts()
      .select("pnr,user_id,organization_id")
      .eq("attempt_key", attemptKey)
      .maybeSingle();
    if (error) return { status: "error" };
    if (
      !data?.pnr ||
      (data.user_id !== null &&
        (data.user_id !== scope.userId || data.organization_id !== (scope.organizationId ?? null)))
    )
      return { status: "not_found" };
    pnr = locatorSchema.parse(data.pnr);

    // Legacy attempts have only a digest. Matching the authenticated itinerary
    // lets us attach its metadata without a PNR supplied by the browser.
    if (data.user_id === null) {
      await attempts()
        .update({
          user_id: scope.userId,
          organization_id: scope.organizationId ?? null,
          flight: testBookingFlightSchema.parse(flight),
        })
        .eq("attempt_key", attemptKey)
        .is("user_id", null);
    }
  } catch {
    return { status: "error" };
  }

  return refreshBookingStatus(pnr);
}

export async function retrieveMyTestBooking(
  userId: string,
  bookingId: string,
): Promise<TestBookingStatus> {
  try {
    const { data, error } = await supabaseAdmin
      .from("flight_test_booking_attempts")
      .select("pnr")
      .eq("attempt_key", bookingId)
      .eq("user_id", userId)
      .is("organization_id", null)
      .maybeSingle();
    if (error) return { status: "error" };
    if (!data?.pnr) return { status: "not_found" };
    return refreshBookingStatus(locatorSchema.parse(data.pnr));
  } catch {
    return { status: "error" };
  }
}

async function refreshBookingStatus(pnr: string): Promise<TestBookingStatus> {
  try {
    const response = await getTravelportAir(`book/reservation/reservations/${pnr}`);
    if (!response.ok) return { status: "provider_error", pnr };
    const { ReservationResponse: result } = reservationResponse.parse(await response.json());
    const { Offer, Receipt } = result.Reservation;
    if (
      result.Result?.Error?.length ||
      !Receipt.some((r) => r.Confirmation?.Locator?.value === pnr)
    ) {
      return { status: "provider_error", pnr };
    }
    const statuses = [
      ...new Set(
        Receipt.flatMap((r) =>
          (r.Confirmation?.OfferStatus?.StatusAir ?? []).map((s) =>
            s.value ? `${s.code} · ${s.value}` : s.code,
          ),
        ),
      ),
    ];
    if (!statuses.length) return { status: "provider_error", pnr };
    const deadline = (Offer ?? [])
      .flatMap((o) => o.TermsAndConditionsFull ?? [])
      .flatMap((term) => {
        const parsed = ticketingTerms.safeParse(term);
        if (!parsed.success) return [];
        const limit = parsed.data.PaymentTimeLimit ?? parsed.data.ExpiryDate;
        return limit ? [limit] : [];
      })
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    const ticketNumbers = [
      ...new Set(
        Receipt.flatMap((receipt) => {
          if (receipt["@type"] !== "ReceiptPayment" || !Array.isArray(receipt.Document)) return [];
          return receipt.Document.flatMap((document: unknown) => {
            const parsed = ticketDocument.safeParse(document);
            return parsed.success && !parsed.data.historicInd ? [parsed.data.Number] : [];
          });
        }),
      ),
    ];
    return {
      status: "retrieved",
      pnr,
      bookingStatus: statuses.join(", "),
      ...(deadline ? { ticketingDeadline: deadline } : {}),
      ...(ticketNumbers.length ? { ticketNumbers } : {}),
    };
  } catch {
    return { status: "provider_error", pnr };
  }
}

export async function listMyTestBookings(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("flight_test_booking_attempts")
    .select("attempt_key,pnr,flight")
    .eq("user_id", userId)
    .is("organization_id", null)
    .not("pnr", "is", null);
  if (error) throw new Error("Unable to load saved test bookings");
  return z
    .array(
      z.object({ attempt_key: z.string(), pnr: locatorSchema, flight: testBookingFlightSchema }),
    )
    .parse(data)
    .sort((a, b) => b.flight.departureDate.localeCompare(a.flight.departureDate))
    .map(({ attempt_key, ...booking }) => ({ id: attempt_key, ...booking }));
}

import { z } from "zod";
import { supabaseAdmin } from "../../integrations/supabase/client.server";
import { testBookingKey } from "./test-booking-key.server";
import { getTravelportCredentials } from "./travelport-config.server";
import { getTravelportAir } from "./travelport-http.server";
import type { PriceScope } from "./travelport-price.server";

const ticketingTerms = z.object({
  PaymentTimeLimit: z.string().datetime({ offset: true }).optional(),
  ExpiryDate: z.string().datetime({ offset: true }).optional(),
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
  | { status: "retrieved"; pnr: string; bookingStatus: string; ticketingDeadline?: string };

export async function retrieveTestBooking(
  scope: PriceScope,
  flight: Parameters<typeof testBookingKey>[2],
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
    const { data, error } = await supabaseAdmin
      .from("flight_test_booking_attempts")
      .select("pnr")
      .eq("attempt_key", attemptKey)
      .maybeSingle();
    if (error) return { status: "error" };
    if (!data?.pnr) return { status: "not_found" };
    pnr = z
      .string()
      .regex(/^[A-Z0-9]{6}$/)
      .parse(data.pnr);
  } catch {
    return { status: "error" };
  }

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
    return {
      status: "retrieved",
      pnr,
      bookingStatus: statuses.join(", "),
      ...(deadline ? { ticketingDeadline: deadline } : {}),
    };
  } catch {
    return { status: "provider_error", pnr };
  }
}

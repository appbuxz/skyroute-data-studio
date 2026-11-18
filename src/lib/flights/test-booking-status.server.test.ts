import { beforeEach, expect, it, vi } from "vitest";
import { testBookingKey } from "./test-booking-key.server";
import { retrieveTestBooking } from "./test-booking-status.server";

const mocks = vi.hoisted(() => ({ get: vi.fn(), lookup: vi.fn() }));
vi.mock("./travelport-http.server", () => ({ getTravelportAir: mocks.get }));
vi.mock("./travelport-config.server", () => ({
  getTravelportCredentials: () => ({ pcc: "TEST_1G" }),
}));
vi.mock("../../integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (_column: string, key: string) => ({ maybeSingle: () => mocks.lookup(key) }),
      }),
    }),
  },
}));

const flight = {
  carrier: "KC",
  flightNumber: "913",
  from: "ALA",
  to: "IST",
  departureDate: "2026-12-12",
};
const owner = { userId: "owner" };
const pnr = "ABC123";
const deadline = "2026-11-21T23:59:00Z";

beforeEach(async () => {
  vi.resetAllMocks();
  const key = await testBookingKey("TEST_1G", owner, flight);
  mocks.lookup.mockImplementation(async (requested: string) => ({
    data: requested === key ? { pnr } : null,
  }));
});

it("reopens the stored booking and takes status and deadline from Reservation Retrieve", async () => {
  mocks.get.mockImplementation(async () =>
    Response.json({
      ReservationResponse: {
        Reservation: {
          Offer: [{ TermsAndConditionsFull: [{ PaymentTimeLimit: deadline }] }],
          Receipt: [
            {
              Confirmation: {
                Locator: { value: pnr },
                OfferStatus: { StatusAir: [{ code: "HK", value: "Confirmed" }] },
              },
            },
          ],
        },
      },
    }),
  );
  for (let opening = 0; opening < 2; opening++) {
    await expect(retrieveTestBooking(owner, flight)).resolves.toEqual({
      status: "retrieved",
      pnr,
      bookingStatus: "HK · Confirmed",
      ticketingDeadline: deadline,
    });
  }
  expect(mocks.get.mock.calls).toEqual([
    [`book/reservation/reservations/${pnr}`],
    [`book/reservation/reservations/${pnr}`],
  ]);
});

it("does not look up the PNR in Travelport for another user with the same itinerary", async () => {
  await expect(retrieveTestBooking({ userId: "other" }, flight)).resolves.toEqual({
    status: "not_found",
  });
  expect(mocks.get).not.toHaveBeenCalled();
});

it("keeps the saved PNR and reports a refresh failure if Travelport is unavailable", async () => {
  mocks.get.mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
  await expect(retrieveTestBooking(owner, flight)).resolves.toEqual({
    status: "provider_error",
    pnr,
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { testBookingKey } from "./test-booking-key.server";
import {
  listMyTestBookings,
  retrieveMyTestBooking,
  retrieveTestBooking,
} from "./test-booking-status.server";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  lookup: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  update: vi.fn(),
}));
vi.mock("./travelport-http.server", () => ({ getTravelportAir: mocks.get }));
vi.mock("./travelport-config.server", () => ({
  getTravelportCredentials: () => ({ pcc: "TEST_1G" }),
}));
vi.mock("../../integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: () => mocks.lookup(value),
          eq: (ownerColumn: string, ownerId: string) => ({
            is: (scopeColumn: string, scopeValue: null) => ({
              maybeSingle: () =>
                mocks.detail({ column, value, ownerColumn, ownerId, scopeColumn, scopeValue }),
            }),
          }),
          is: (scopeColumn: string, scopeValue: null) => ({
            not: (pnrColumn: string, operator: string, pnrValue: null) =>
              mocks.list({ column, value, scopeColumn, scopeValue, pnrColumn, operator, pnrValue }),
          }),
        }),
      }),
      update: (metadata: unknown) => ({
        eq: (_column: string, key: string) => ({
          is: (column: string, value: null) => mocks.update(metadata, key, column, value),
        }),
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
    data: requested === key ? { pnr, user_id: owner.userId, organization_id: null } : null,
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

it("lists only successful personal bookings for the current user without contacting Travelport", async () => {
  const bookingId = await testBookingKey("TEST_1G", owner, flight);
  const records = [
    { userId: owner.userId, organizationId: null, pnr, flight, attempt_key: bookingId },
    { userId: "other", organizationId: null, pnr: "DEF456", flight },
    { userId: owner.userId, organizationId: "agency", pnr: "XYZ789", flight },
    { userId: owner.userId, organizationId: null, pnr: null, flight },
  ];
  mocks.list.mockImplementation(async (filters) => {
    expect(filters).toEqual({
      column: "user_id",
      value: owner.userId,
      scopeColumn: "organization_id",
      scopeValue: null,
      pnrColumn: "pnr",
      operator: "is",
      pnrValue: null,
    });
    return {
      data: records.filter(
        (r) =>
          r.userId === filters.value &&
          r.organizationId === filters.scopeValue &&
          r.pnr !== filters.pnrValue,
      ),
    };
  });
  await expect(listMyTestBookings(owner.userId)).resolves.toEqual([{ id: bookingId, pnr, flight }]);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("records ownership for a legacy booking when opened by its verified owner", async () => {
  const key = await testBookingKey("TEST_1G", owner, flight);
  mocks.lookup.mockImplementation(async (requested: string) => ({
    data: requested === key ? { pnr, user_id: null, organization_id: null } : null,
  }));
  mocks.get.mockRejectedValue(new Error("Unavailable"));
  await expect(retrieveTestBooking(owner, flight)).resolves.toEqual({
    status: "provider_error",
    pnr,
  });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith(
    { user_id: owner.userId, organization_id: null, flight },
    key,
    "user_id",
    null,
  );
});

it("requires both the current owner and personal scope when opening a list entry", async () => {
  const bookingId = await testBookingKey("TEST_1G", owner, flight);
  mocks.detail.mockResolvedValue({ data: null });
  await expect(retrieveMyTestBooking("other", bookingId)).resolves.toEqual({ status: "not_found" });
  expect(mocks.detail).toHaveBeenCalledExactlyOnceWith({
    column: "attempt_key",
    value: bookingId,
    ownerColumn: "user_id",
    ownerId: "other",
    scopeColumn: "organization_id",
    scopeValue: null,
  });
  expect(mocks.get).not.toHaveBeenCalled();
});

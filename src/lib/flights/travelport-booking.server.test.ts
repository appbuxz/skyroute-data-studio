import { beforeEach, expect, it, vi } from "vitest";
import { createTravelportTestBooking } from "./travelport-booking.server";

const mocks = vi.hoisted(() => ({
  openCheckout: vi.fn(),
  post: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  enabled: vi.fn(),
}));
vi.mock("../../integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => mocks },
}));
vi.mock("./travelport-checkout-token.server", () => ({ openCheckout: mocks.openCheckout }));
vi.mock("./travelport-config.server", () => ({
  testBookingEnabled: mocks.enabled,
  getTravelportCredentials: () => ({ pcc: "TEST_1G" }),
}));
vi.mock("./travelport-http.server", () => ({ postTravelportAir: mocks.post }));

const scope = { userId: "verified-user" };
const passenger = { given: "TEST", surname: "SKYROUTE" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.openCheckout.mockResolvedValue({
    ...scope,
    expiresAt: Date.now() + 60_000,
    searchPrice: { amount: 115160, currency: "KZT" },
    booking: {
      carrier: "KC",
      flightNumber: "913",
      from: "ALA",
      to: "IST",
      departureDate: "2026-12-12",
      departureTime: "17:00:00",
      arrivalDate: "2026-12-12",
      arrivalTime: "21:00:00",
      cabin: "Economy",
      classOfService: "E",
    },
  });
  mocks.insert.mockResolvedValueOnce({ error: null }).mockResolvedValue({
    error: { code: "23505" },
  });
  mocks.select.mockReturnValue({ eq: () => ({ single: async () => ({ data: { pnr: null } }) }) });
  mocks.post
    .mockResolvedValueOnce(
      Response.json({
        ReservationResponse: { Reservation: { Identifier: { value: "workbench-id" } } },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        OfferListResponse: { OfferID: [{ Identifier: { value: "offer-id" } }] },
      }),
    )
    .mockResolvedValueOnce(Response.json({ TravelerResponse: {} }));
});

it("does not send another Commit for an ambiguous outcome, even with a new price token", async () => {
  mocks.post.mockRejectedValueOnce(new DOMException("Timeout", "TimeoutError"));
  await expect(createTravelportTestBooking("first", scope, passenger)).resolves.toEqual({
    status: "unknown",
  });
  await expect(createTravelportTestBooking("refreshed", scope, passenger)).resolves.toEqual({
    status: "unknown",
  });
  expect(mocks.post).toHaveBeenCalledTimes(4);
  expect(mocks.post.mock.calls[3]?.[0]).toBe("book/reservation/reservations/workbench-id");
  expect(mocks.insert.mock.calls[0]).toEqual(mocks.insert.mock.calls[1]);
  expect(mocks.delete).not.toHaveBeenCalled();
});

it("returns a Travelport locator only after Commit and persists it without passenger fields", async () => {
  mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
  mocks.post.mockResolvedValueOnce(
    Response.json({
      ReservationResponse: {
        Reservation: {
          Receipt: [
            { Confirmation: { Locator: { source: "KC", value: "QWERTY" } } },
            { Confirmation: { Locator: { source: "1G", value: "ABC123" } } },
          ],
        },
      },
    }),
  );
  await expect(createTravelportTestBooking("first", scope, passenger)).resolves.toEqual({
    status: "booked",
    pnr: "ABC123",
  });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ pnr: "ABC123" });
});

it("blocks booking when the environment gate is closed or the token belongs to another user", async () => {
  mocks.enabled.mockReturnValueOnce(false);
  await expect(createTravelportTestBooking("first", scope, passenger)).resolves.toEqual({
    status: "unavailable",
  });
  await expect(
    createTravelportTestBooking("first", { userId: "other" }, passenger),
  ).resolves.toEqual({
    status: "unavailable",
  });
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.post).not.toHaveBeenCalled();
});

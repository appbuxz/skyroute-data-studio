import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  client: vi.fn(),
  status: vi.fn(),
  list: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseStatus: mocks.status }));
vi.mock("../supabase/auth.server", () => ({ requireAuth: mocks.auth }));
vi.mock("../supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("./test-booking-status.server", () => ({
  listSavedTestBookings: mocks.list,
  retrieveSavedTestBooking: mocks.retrieve,
}));

import {
  getTestBookingStatusServer,
  listAgencyTestBookingsServer,
} from "./test-booking-status.functions";

const userId = "f1000000-0000-4000-8000-000000000001";
const agency = "f2000000-0000-4000-8000-000000000001";
const foreignAgency = "f2000000-0000-4000-8000-000000000002";
const bookingId = "a".repeat(64);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: userId });
  mocks.client.mockImplementation(() => {
    const query = {
      eq(column: string, id: string) {
        if (column === "organization_id") expect(id).toMatch(/^f200/);
        if (column === "organization_id") requestedAgency = id;
        return query;
      },
      limit: async () => ({
        data:
          requestedAgency === agency
            ? [{ organization_id: agency, user_id: userId, role: "member" }]
            : [],
        error: null,
      }),
    };
    let requestedAgency: string | undefined;
    return { from: () => ({ select: () => query }) };
  });
});

it("uses the verified agency and user when listing and opening a booking", async () => {
  const scope = { userId, organizationId: agency, role: "member" };
  const list = [{ id: bookingId }];
  const result = { status: "retrieved", bookingStatus: "HK" };
  mocks.list.mockResolvedValue(list);
  mocks.retrieve.mockResolvedValue(result);

  await expect(listAgencyTestBookingsServer({ data: { organizationId: agency } })).resolves.toEqual(
    list,
  );
  await expect(
    getTestBookingStatusServer({ data: { bookingId, organizationId: agency } }),
  ).resolves.toEqual(result);
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith(scope);
  expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith(scope, bookingId);
});

it("denies both listing and opening bookings in an agency without membership", async () => {
  const data = { organizationId: foreignAgency };
  await expect(listAgencyTestBookingsServer({ data })).rejects.toMatchObject({ statusCode: 403 });
  await expect(getTestBookingStatusServer({ data: { ...data, bookingId } })).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(mocks.status.mock.calls).toEqual([[403], [403]]);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.retrieve).not.toHaveBeenCalled();
});

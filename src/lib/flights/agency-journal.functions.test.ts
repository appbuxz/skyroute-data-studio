import { beforeEach, expect, it, vi } from "vitest";
import type { ZodTypeAny } from "zod";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), insert: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: ZodTypeAny) => ({
      handler:
        (handler: (args: { data: unknown }) => unknown) =>
        async ({ data }: { data: unknown }) =>
          handler({ data: schema.parse(data) }),
    }),
  }),
}));
vi.mock("../organizations/authorization.server", () => ({ requireOrganization: mocks.authorize }));
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: () => ({ from: mocks.from }),
}));

import { listAgencyJournalEntries, saveAgencyJournalEntry } from "./agency-journal.functions";

const organizationId = "f2000000-0000-4000-8000-000000000001";
const userId = "f1000000-0000-4000-8000-000000000001";
const snapshot = {
  params: {
    origin: "ALA",
    destination: "IST",
    departureDate: "2026-11-20",
    passengers: 1,
    cabinClass: "economy" as const,
  },
  fetchedAt: "2026-11-10T09:00:00Z",
  offers: [
    {
      id: "offer",
      carrier: "KC",
      flightNumber: "KC100",
      origin: "ALA",
      destination: "IST",
      departureAt: "2026-11-20T09:00:00Z",
      arrivalAt: "2026-11-20T15:00:00Z",
      stops: 0,
      cabinClass: "economy" as const,
      price: { amount: 250, currency: "USD" },
    },
  ],
  hotel: {
    name: "Hotel",
    checkIn: "2026-11-20",
    checkOut: "2026-11-22",
    amount: 100,
    currency: "USD",
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ organizationId, userId, role: "member" });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockResolvedValue({ error: null });
});

it("writes a validated snapshot with the verified author and excludes checkout tokens", async () => {
  const payload = {
    organizationId,
    authorId: "forged",
    clientLabel: "  Client 27  ",
    snapshot: {
      ...snapshot,
      offers: snapshot.offers.map((offer) => ({ ...offer, checkoutToken: "secret" })),
    },
  };
  await saveAgencyJournalEntry({ data: payload });
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(organizationId);
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("agency_flight_journal");
  expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
    organization_id: organizationId,
    author_id: userId,
    client_label: "Client 27",
    snapshot,
  });
});

it("rejects blank labels and empty shortlists before writing", async () => {
  await expect(
    saveAgencyJournalEntry({ data: { organizationId, clientLabel: " ", snapshot } }),
  ).rejects.toThrow();
  await expect(
    saveAgencyJournalEntry({
      data: { organizationId, clientLabel: "Client", snapshot: { ...snapshot, offers: [] } },
    }),
  ).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
});

it("checks membership before either reading or writing journal entries", async () => {
  mocks.authorize.mockRejectedValue(new Error("Organization access denied"));
  await expect(
    saveAgencyJournalEntry({ data: { organizationId, clientLabel: "Client", snapshot } }),
  ).rejects.toThrow("Organization access denied");
  await expect(listAgencyJournalEntries({ data: { organizationId, page: 0 } })).rejects.toThrow(
    "Organization access denied",
  );
  expect(mocks.from).not.toHaveBeenCalled();
});

it("keeps valid entries available when a stored snapshot cannot be opened", async () => {
  const valid = {
    id: "valid",
    client_label: "Valid fixture",
    created_at: "2026-11-20T09:00:00Z",
    snapshot,
  };
  const invalid = { ...valid, id: "invalid", client_label: "Invalid fixture", snapshot: {} };
  const query = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: [invalid, valid], error: null }),
  };
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue(query) });

  const result = await listAgencyJournalEntries({ data: { organizationId, page: 0 } });
  expect(query.eq).toHaveBeenCalledWith("organization_id", organizationId);
  expect(query.order.mock.calls).toEqual([
    ["created_at", { ascending: false }],
    ["id", { ascending: false }],
  ]);
  expect(result).toEqual({
    hasNext: false,
    entries: [
      {
        id: invalid.id,
        clientLabel: invalid.client_label,
        createdAt: invalid.created_at,
        snapshot: null,
      },
      { id: valid.id, clientLabel: valid.client_label, createdAt: valid.created_at, snapshot },
    ],
  });
});

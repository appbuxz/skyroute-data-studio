import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  setResponseStatus: vi.fn(),
}));

vi.mock("../supabase/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase/auth.server")>()),
  requireAuth: mocks.requireAuth,
}));
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: mocks.createClient,
}));
vi.mock("@tanstack/react-start/server", () => ({
  setResponseStatus: mocks.setResponseStatus,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => Promise<unknown>) => fn }),
}));

import { UnauthorizedError } from "../supabase/auth.server";
import { OrganizationAuthorizationError } from "./authorization.server";
import { getOrganizationMemberships } from "./session.functions";

const USER = "f1000000-0000-4000-8000-000000000001";
const OTHER_USER = "f1000000-0000-4000-8000-000000000002";
const ORG_A = "f2000000-0000-4000-8000-000000000001";
const ORG_B = "f2000000-0000-4000-8000-000000000002";

function membership(organizationId = ORG_A, name = "Agency A", role = "member") {
  return {
    organization_id: organizationId,
    user_id: USER,
    role,
    organization: { id: organizationId, name },
  };
}

async function expectUnavailable() {
  const result = getOrganizationMemberships();
  await expect(result).rejects.toBeInstanceOf(OrganizationAuthorizationError);
  await expect(result).rejects.toMatchObject({
    statusCode: 503,
    code: "AUTHORIZATION_UNAVAILABLE",
    message: "Authorization service unavailable",
  });
  expect(mocks.setResponseStatus).toHaveBeenCalledExactlyOnceWith(503);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: USER });
  mocks.createClient.mockReturnValue({ from: mocks.from });
  const query = { select: mocks.select, eq: mocks.eq, order: mocks.order };
  mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.order.mockResolvedValue({ data: [membership()], error: null });
});

describe("getOrganizationMemberships", () => {
  it("preserves authentication errors without querying memberships", async () => {
    const error = new UnauthorizedError();
    mocks.requireAuth.mockRejectedValue(error);
    await expect(getOrganizationMemberships()).rejects.toBe(error);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.setResponseStatus).not.toHaveBeenCalled();
  });

  it("returns an empty list for an authenticated user without memberships", async () => {
    mocks.order.mockResolvedValue({ data: [], error: null });
    await expect(getOrganizationMemberships()).resolves.toEqual([]);
  });

  it.each(["owner", "admin", "member"])("returns a single %s membership", async (role) => {
    mocks.order.mockResolvedValue({ data: [membership(ORG_A, "Agency A", role)], error: null });
    await expect(getOrganizationMemberships()).resolves.toEqual([
      { organizationId: ORG_A, organizationName: "Agency A", role },
    ]);
  });

  it("returns all selected memberships without user IDs or other member data", async () => {
    mocks.order.mockResolvedValue({
      data: [
        { ...membership(ORG_A, "Agency A", "owner"), private_field: "not returned" },
        membership(ORG_B, "Agency B", "admin"),
      ],
      error: null,
    });
    await expect(getOrganizationMemberships()).resolves.toEqual([
      { organizationId: ORG_A, organizationName: "Agency A", role: "owner" },
      { organizationId: ORG_B, organizationName: "Agency B", role: "admin" },
    ]);
  });

  it("uses the authenticated client and explicitly filters by the verified user", async () => {
    await getOrganizationMemberships();
    expect(mocks.requireAuth).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("organization_members");
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith(
      "organization_id, user_id, role, organization:organizations!organization_members_organization_fkey(id, name)",
    );
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("user_id", USER);
    expect(mocks.order).toHaveBeenCalledExactlyOnceWith("organization_id");
  });

  it("rejects returned rows for another user instead of leaking a partial list", async () => {
    mocks.order.mockResolvedValue({
      data: [membership(), { ...membership(ORG_B), user_id: OTHER_USER }],
      error: null,
    });
    await expectUnavailable();
  });

  it("rejects a joined organization inconsistent with the membership", async () => {
    mocks.order.mockResolvedValue({
      data: [{ ...membership(), organization: { id: ORG_B, name: "Other agency" } }],
      error: null,
    });
    await expectUnavailable();
  });

  it("fails closed on a returned database error even when rows exist", async () => {
    mocks.order.mockResolvedValue({ data: [membership()], error: { message: "private details" } });
    await expectUnavailable();
  });

  it("sanitizes thrown database errors", async () => {
    mocks.order.mockRejectedValue(new Error("private details"));
    await expectUnavailable();
  });

  it("handles client configuration failures without exposing details", async () => {
    mocks.createClient.mockImplementation(() => {
      throw new Error("private configuration");
    });
    await expectUnavailable();
  });

  it.each([
    null,
    {},
    [null],
    [{ ...membership(), organization: null }],
    [{ ...membership(), organization: [] }],
    [{ ...membership(), organization: { id: ORG_A, name: "   " } }],
    [{ ...membership(), organization_id: "invalid" }],
    [membership(ORG_A, "Agency A", "superadmin")],
    [membership(), membership()],
  ])("fails closed on invalid membership data %j", async (data) => {
    mocks.order.mockResolvedValue({ data, error: null });
    await expectUnavailable();
  });

  it("queries again rather than caching memberships", async () => {
    await expect(getOrganizationMemberships()).resolves.toHaveLength(1);
    mocks.order.mockResolvedValue({ data: [], error: null });
    await expect(getOrganizationMemberships()).resolves.toEqual([]);
    expect(mocks.requireAuth).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
  });
});

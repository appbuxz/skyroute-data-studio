import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  limit: vi.fn(),
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

import { UnauthorizedError } from "../supabase/auth.server";
import { OrganizationAuthorizationError, requireOrganization } from "./authorization.server";

const USER = "f1000000-0000-4000-8000-000000000001";
const OTHER_USER = "f1000000-0000-4000-8000-000000000002";
const ORG_A = "f2000000-0000-4000-8000-000000000001";
const ORG_B = "f2000000-0000-4000-8000-000000000002";

function membership(organizationId = ORG_A, role = "member") {
  return { organization_id: organizationId, user_id: USER, role };
}

async function expectFailure(
  promise: ReturnType<typeof requireOrganization>,
  statusCode: number,
  code: string,
) {
  await expect(promise).rejects.toBeInstanceOf(OrganizationAuthorizationError);
  await expect(promise).rejects.toMatchObject({ statusCode, code });
  expect(mocks.setResponseStatus).toHaveBeenCalledExactlyOnceWith(statusCode);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: USER });
  mocks.createClient.mockReturnValue({ from: mocks.from });
  const query = { select: mocks.select, eq: mocks.eq, limit: mocks.limit };
  mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.limit.mockResolvedValue({ data: [membership()], error: null });
});

describe("requireOrganization", () => {
  it("preserves the existing unauthenticated error without querying memberships", async () => {
    const error = new UnauthorizedError();
    mocks.requireAuth.mockRejectedValue(error);

    await expect(requireOrganization()).rejects.toBe(error);
    expect(error.statusCode).toBe(401);
    expect(mocks.requireAuth).toHaveBeenCalledOnce();
    expect(mocks.createClient).not.toHaveBeenCalled();
    // requireAuth owns the authentication response status, not this helper.
    expect(mocks.setResponseStatus).not.toHaveBeenCalled();
  });

  it("authenticates before processing an invalid organization ID", async () => {
    const error = new UnauthorizedError();
    mocks.requireAuth.mockRejectedValue(error);
    await expect(requireOrganization("invalid")).rejects.toBe(error);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([undefined, ORG_B])("denies an absent membership for selection %s", async (selection) => {
    mocks.limit.mockResolvedValue({ data: [], error: null });
    await expectFailure(requireOrganization(selection), 403, "ORGANIZATION_ACCESS_DENIED");
  });

  it.each(["owner", "admin", "member"] as const)(
    "automatically resolves a sole %s membership",
    async (role) => {
      mocks.limit.mockResolvedValue({ data: [membership(ORG_A, role)], error: null });
      await expect(requireOrganization()).resolves.toEqual({
        userId: USER,
        organizationId: ORG_A,
        role,
      });
      expect(mocks.setResponseStatus).not.toHaveBeenCalled();
    },
  );

  it("requires a selection for multiple organizations", async () => {
    mocks.limit.mockResolvedValue({ data: [membership(), membership(ORG_B)], error: null });
    await expectFailure(requireOrganization(), 409, "ORGANIZATION_SELECTION_REQUIRED");
  });

  it("authorizes an explicit selection using the returned database role", async () => {
    mocks.limit.mockResolvedValue({ data: [membership(ORG_B, "admin")], error: null });
    await expect(requireOrganization(ORG_B)).resolves.toEqual({
      userId: USER,
      organizationId: ORG_B,
      role: "admin",
    });
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", ORG_B);
  });

  it("normalizes valid uppercase UUIDs before filtering", async () => {
    await expect(requireOrganization(ORG_A.toUpperCase())).resolves.toMatchObject({
      organizationId: ORG_A,
    });
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", ORG_A);
  });

  it("queries only memberships filtered by the verified user, with a two-row bound", async () => {
    await requireOrganization();
    expect(mocks.requireAuth).toHaveBeenCalledOnce();
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("organization_members");
    expect(mocks.select).toHaveBeenCalledExactlyOnceWith("organization_id, user_id, role");
    expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("user_id", USER);
    expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("does not fall back to a different organization for an unauthorized explicit ID", async () => {
    mocks.limit.mockResolvedValue({ data: [], error: null });
    await expectFailure(requireOrganization(ORG_B), 403, "ORGANIZATION_ACCESS_DENIED");
    expect(mocks.eq.mock.calls).toEqual([
      ["user_id", USER],
      ["organization_id", ORG_B],
    ]);
    expect(mocks.limit).toHaveBeenCalledOnce();
  });

  it.each(["", "invalid", `${ORG_A} `, "' OR true --"])(
    "rejects invalid UUID %j before querying",
    async (value) => {
      await expectFailure(requireOrganization(value), 400, "INVALID_ORGANIZATION_ID");
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("fails closed on a returned database error even when data is present", async () => {
    mocks.limit.mockResolvedValue({
      data: [membership()],
      error: { message: "private database details" },
    });
    await expectFailure(requireOrganization(), 503, "AUTHORIZATION_UNAVAILABLE");
  });

  it("sanitizes thrown database failures", async () => {
    mocks.limit.mockRejectedValue(new Error("private connection details"));
    await expectFailure(requireOrganization(), 503, "AUTHORIZATION_UNAVAILABLE");
  });

  it("fails closed when the authenticated client cannot be created", async () => {
    mocks.createClient.mockImplementation(() => {
      throw new Error("configuration details");
    });
    await expectFailure(requireOrganization(), 503, "AUTHORIZATION_UNAVAILABLE");
  });

  it.each([
    null,
    {},
    [null],
    [{ organization_id: ORG_A, user_id: USER }],
    [membership(ORG_A, "superadmin")],
    [membership("invalid")],
    [{ ...membership(), user_id: "invalid" }],
    [membership(), membership()],
  ])("fails closed on invalid membership data %j", async (data) => {
    mocks.limit.mockResolvedValue({ data, error: null });
    await expectFailure(requireOrganization(), 503, "AUTHORIZATION_UNAVAILABLE");
  });

  it("rejects a returned membership for another user", async () => {
    mocks.limit.mockResolvedValue({
      data: [{ ...membership(), user_id: OTHER_USER }],
      error: null,
    });
    await expectFailure(requireOrganization(), 503, "AUTHORIZATION_UNAVAILABLE");
  });

  it("rejects a returned organization that does not match the explicit selection", async () => {
    await expectFailure(requireOrganization(ORG_B), 503, "AUTHORIZATION_UNAVAILABLE");
  });

  it("rechecks membership after revocation instead of caching authorization", async () => {
    mocks.limit
      .mockResolvedValueOnce({ data: [membership()], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    await expect(requireOrganization(ORG_A)).resolves.toMatchObject({ organizationId: ORG_A });
    await expectFailure(requireOrganization(ORG_A), 403, "ORGANIZATION_ACCESS_DENIED");
    expect(mocks.requireAuth).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(mocks.eq.mock.calls).toEqual([
      ["user_id", USER],
      ["organization_id", ORG_A],
      ["user_id", USER],
      ["organization_id", ORG_A],
    ]);
  });
});

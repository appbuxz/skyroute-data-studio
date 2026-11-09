import "@tanstack/react-start/server-only";

import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import type { OrganizationId } from "../flights/types";
import { requireAuth } from "../supabase/auth.server";
import { createSupabaseServerClient } from "../supabase/server";

const uuidSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const membershipsSchema = z
  .array(
    z.object({
      organization_id: uuidSchema,
      user_id: uuidSchema,
      role: z.enum(["owner", "admin", "member"]),
    }),
  )
  .max(2);

const authorizationErrors = {
  INVALID_ORGANIZATION_ID: { statusCode: 400, message: "Invalid organization ID" },
  ORGANIZATION_ACCESS_DENIED: { statusCode: 403, message: "Organization access denied" },
  ORGANIZATION_SELECTION_REQUIRED: { statusCode: 409, message: "Organization selection required" },
  AUTHORIZATION_UNAVAILABLE: { statusCode: 503, message: "Authorization service unavailable" },
} as const;

export class OrganizationAuthorizationError extends Error {
  readonly statusCode: number;

  constructor(readonly code: keyof typeof authorizationErrors) {
    super(authorizationErrors[code].message);
    this.name = "OrganizationAuthorizationError";
    this.statusCode = authorizationErrors[code].statusCode;
  }
}

function rejectAuthorization(code: keyof typeof authorizationErrors): never {
  const error = new OrganizationAuthorizationError(code);
  setResponseStatus(error.statusCode);
  throw error;
}

/** Verify current membership on every call using the caller's cookies and RLS. */
export async function requireOrganization(requestedOrganizationId?: string): Promise<{
  userId: string;
  organizationId: OrganizationId;
  role: "owner" | "admin" | "member";
}> {
  // Preserve the existing authentication error and its 401 response unchanged.
  const user = await requireAuth();

  let organizationId: string | undefined;
  if (requestedOrganizationId !== undefined) {
    const parsed = uuidSchema.safeParse(requestedOrganizationId);
    if (!parsed.success) {
      rejectAuthorization("INVALID_ORGANIZATION_ID");
    }
    organizationId = parsed.data;
  }

  let response: { data: unknown; error: unknown };
  try {
    const supabase = createSupabaseServerClient();
    let query = supabase
      .from("organization_members")
      .select("organization_id, user_id, role")
      .eq("user_id", user.id);

    if (organizationId !== undefined) {
      query = query.eq("organization_id", organizationId);
    }

    // Two rows suffice to detect ambiguous selection without fetching a roster.
    response = await query.limit(2);
  } catch {
    rejectAuthorization("AUTHORIZATION_UNAVAILABLE");
  }

  if (response.error) {
    rejectAuthorization("AUTHORIZATION_UNAVAILABLE");
  }

  const parsed = membershipsSchema.safeParse(response.data);
  if (!parsed.success) {
    rejectAuthorization("AUTHORIZATION_UNAVAILABLE");
  }

  const memberships = parsed.data;
  if (
    memberships.some(
      (membership) =>
        membership.user_id !== user.id.toLowerCase() ||
        (organizationId !== undefined && membership.organization_id !== organizationId),
    ) ||
    new Set(memberships.map((membership) => membership.organization_id)).size !== memberships.length
  ) {
    rejectAuthorization("AUTHORIZATION_UNAVAILABLE");
  }

  const membership = memberships[0];
  if (!membership) {
    // Do not distinguish nonexistent organizations from inaccessible ones.
    rejectAuthorization("ORGANIZATION_ACCESS_DENIED");
  }
  if (memberships.length > 1) {
    rejectAuthorization("ORGANIZATION_SELECTION_REQUIRED");
  }

  return {
    userId: user.id,
    organizationId: membership.organization_id as OrganizationId,
    role: membership.role,
  };
}

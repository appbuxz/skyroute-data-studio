import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import type { OrganizationId } from "../flights/types";
import { requireAuth } from "../supabase/auth.server";
import { createSupabaseServerClient } from "../supabase/server";
import { OrganizationAuthorizationError } from "./authorization.server";

export interface OrganizationMembership {
  organizationId: OrganizationId;
  organizationName: string;
  role: "owner" | "admin" | "member";
}

const uuidSchema = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const membershipsSchema = z.array(
  z.object({
    organization_id: uuidSchema,
    user_id: uuidSchema,
    role: z.enum(["owner", "admin", "member"]),
    organization: z.object({
      id: uuidSchema,
      name: z.string().trim().min(1).max(120),
    }),
  }),
);

/** Discover selectable organizations; this does not authorize a later search. */
export const getOrganizationMemberships = createServerFn({ method: "GET" }).handler(
  async (): Promise<OrganizationMembership[]> => {
    // Preserve requireAuth's 401 instead of turning authentication into a 503.
    const user = await requireAuth();

    try {
      const supabase = createSupabaseServerClient();
      const { data, error } = await supabase
        .from("organization_members")
        .select(
          "organization_id, user_id, role, organization:organizations!organization_members_organization_fkey(id, name)",
        )
        .eq("user_id", user.id)
        .order("organization_id");

      if (error) throw new Error("Membership query failed");
      const memberships = membershipsSchema.parse(data);
      if (
        memberships.some(
          (membership) =>
            membership.user_id !== user.id.toLowerCase() ||
            membership.organization_id !== membership.organization.id,
        ) ||
        new Set(memberships.map((membership) => membership.organization_id)).size !==
          memberships.length
      ) {
        throw new Error("Invalid membership response");
      }

      return memberships.map((membership) => ({
        organizationId: membership.organization_id as OrganizationId,
        organizationName: membership.organization.name,
        role: membership.role,
      }));
    } catch {
      const error = new OrganizationAuthorizationError("AUTHORIZATION_UNAVAILABLE");
      setResponseStatus(error.statusCode);
      throw error;
    }
  },
);

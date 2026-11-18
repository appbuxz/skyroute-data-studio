import { requireOrganization } from "../organizations/authorization.server";
import { requireAuth } from "../supabase/auth.server";

export async function requirePriceScope(organizationId?: string) {
  return organizationId === undefined
    ? { userId: (await requireAuth()).id }
    : await requireOrganization(organizationId);
}

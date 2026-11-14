import { redirect } from "@tanstack/react-router";
import { getOrganizationMemberships } from "./session.functions";

/** Check membership on the server before rendering agency tools.
 * Selected-organization data calls must additionally use requireOrganization.
 */
export async function requireAgencyWorkspace() {
  const memberships = await getOrganizationMemberships();
  if (memberships.length === 0) throw redirect({ to: "/search", replace: true });
}

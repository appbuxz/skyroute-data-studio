import { createContext, useContext } from "react";
import type { FlightSearchSnapshot, OrganizationId } from "../flights/types";
import type { OrganizationMembership } from "./session.functions";

export interface WorkspaceSearch extends FlightSearchSnapshot {
  organizationId: OrganizationId;
}

export interface OrganizationWorkspace {
  memberships: OrganizationMembership[];
  selectedOrganizationId: OrganizationId | null;
  status: "loading" | "ready" | "error";
  error: string | null;
  authorizationError: string | null;
  canSearch: boolean;
  version: number;
  search: WorkspaceSearch | null;
  selectOrganization: (id: string) => void;
  reloadMemberships: () => void;
  isCurrentScope: () => boolean;
  publishSearch: (search: WorkspaceSearch) => void;
  clearSearch: () => void;
  rejectSelection: (message: string) => void;
}

export const OrganizationWorkspaceContext = createContext<OrganizationWorkspace | null>(null);

export function useOrganizationWorkspace(): OrganizationWorkspace {
  const workspace = useContext(OrganizationWorkspaceContext);
  if (!workspace) throw new Error("Organization workspace provider is required");
  return workspace;
}

/** Accept only known public errors; never display arbitrary backend messages. */
export function organizationFailure(
  error: unknown,
): { message: string; blockSelection: boolean } | null {
  if (typeof error !== "object" || error === null) return null;
  const fields = error as {
    code?: unknown;
    statusCode?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const status = fields.statusCode ?? fields.status;
  if (status === 401 || fields.message === "Authentication required") {
    return { message: "Your session has expired. Sign in again.", blockSelection: true };
  }
  if (
    status === 403 ||
    fields.code === "ORGANIZATION_ACCESS_DENIED" ||
    fields.message === "Organization access denied"
  ) {
    return {
      message:
        "You no longer have access to this organization. Select another organization or refresh organizations.",
      blockSelection: true,
    };
  }
  if (
    status === 409 ||
    fields.code === "ORGANIZATION_SELECTION_REQUIRED" ||
    fields.message === "Organization selection required"
  ) {
    return { message: "Select an organization before searching.", blockSelection: true };
  }
  if (
    status === 400 ||
    fields.code === "INVALID_ORGANIZATION_ID" ||
    fields.message === "Invalid organization ID"
  ) {
    return {
      message: "The organization selection is invalid. Refresh organizations and select again.",
      blockSelection: true,
    };
  }
  if (
    status === 503 ||
    fields.code === "AUTHORIZATION_UNAVAILABLE" ||
    fields.message === "Authorization service unavailable"
  ) {
    return {
      message: "Unable to verify organization access. Please try again.",
      blockSelection: false,
    };
  }
  return null;
}

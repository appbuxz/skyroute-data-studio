import { useOrganizationWorkspace } from "@/lib/organizations/workspace-context";

export function OrganizationSelector() {
  const workspace = useOrganizationWorkspace();
  return (
    <div className="space-y-2">
      <label
        htmlFor="workspace-organization"
        className="text-xs font-medium text-sidebar-accent-foreground"
      >
        Organization
      </label>
      <select
        id="workspace-organization"
        className="h-9 w-full min-w-0 rounded-md border border-sidebar-border bg-sidebar px-2 text-sm text-sidebar-foreground disabled:opacity-60"
        value={workspace.selectedOrganizationId ?? ""}
        onChange={(event) => workspace.selectOrganization(event.target.value)}
        disabled={workspace.status !== "ready" || workspace.memberships.length === 0}
        aria-describedby="organization-status"
      >
        <option value="">Select an organization</option>
        {workspace.memberships.map((membership) => (
          <option key={membership.organizationId} value={membership.organizationId}>
            {membership.organizationName}
          </option>
        ))}
      </select>
      <p
        id="organization-status"
        role={workspace.error || workspace.authorizationError ? "alert" : "status"}
        className="text-xs opacity-90"
      >
        {workspace.status === "loading"
          ? "Loading organizations…"
          : (workspace.error ??
            workspace.authorizationError ??
            (workspace.memberships.length === 0
              ? "No organization assigned. Flight Search is available with your account; agency tools require membership."
              : !workspace.selectedOrganizationId
                ? "Select an organization to search flights."
                : "Searches use the selected organization."))}
      </p>
      <button
        type="button"
        onClick={workspace.reloadMemberships}
        disabled={workspace.status === "loading"}
        className="text-xs underline disabled:opacity-60"
      >
        Refresh organizations
      </button>
    </div>
  );
}

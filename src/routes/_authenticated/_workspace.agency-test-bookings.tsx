import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/common/page-header";
import { TestBookingsList } from "@/components/flights/test-bookings-list";
import { listAgencyTestBookingsServer } from "@/lib/flights/test-booking-status.functions";
import type { OrganizationId } from "@/lib/flights/types";
import { useLanguage } from "@/lib/i18n/language-context";
import { requireAgencyWorkspace } from "@/lib/organizations/agency-access";
import { useOrganizationWorkspace } from "@/lib/organizations/workspace-context";

export const Route = createFileRoute("/_authenticated/_workspace/agency-test-bookings")({
  beforeLoad: requireAgencyWorkspace,
  head: () => ({ meta: [{ title: "Agency bookings — Flight Analytics" }] }),
  component: AgencyTestBookings,
});

function AgencyTestBookings() {
  const { t } = useLanguage();
  const workspace = useOrganizationWorkspace();
  const organizationId = workspace.selectedOrganizationId;
  return (
    <>
      <PageHeader title={t("Agency bookings")} />
      {workspace.status === "loading" && <p role="status">{t("Loading organizations…")}</p>}
      {(workspace.authorizationError || workspace.error) && (
        <p role="alert">{t(workspace.authorizationError ?? workspace.error ?? "")}</p>
      )}
      {workspace.status === "ready" && !organizationId && !workspace.authorizationError && (
        <p>{t("Select an organization")}</p>
      )}
      {workspace.canSearch && organizationId && (
        <AgencyBookingResults
          key={workspace.version}
          organizationId={organizationId}
          userId={workspace.userId}
          version={workspace.version}
        />
      )}
    </>
  );
}

function AgencyBookingResults({
  organizationId,
  userId,
  version,
}: {
  organizationId: OrganizationId;
  userId: string;
  version: number;
}) {
  const { t } = useLanguage();
  const listBookings = useServerFn(listAgencyTestBookingsServer);
  const bookings = useQuery({
    queryKey: ["agency-test-bookings", userId, organizationId, version],
    queryFn: ({ signal }) => listBookings({ data: { organizationId }, signal }),
    gcTime: 0,
  });

  if (bookings.isPending) return <p role="status">{t("Loading test bookings…")}</p>;
  if (bookings.isError) return <p role="alert">{t("Unable to load test bookings.")}</p>;
  if (!bookings.data.length) return <p>{t("No agency test bookings yet.")}</p>;
  return <TestBookingsList bookings={bookings.data} organizationId={organizationId} />;
}

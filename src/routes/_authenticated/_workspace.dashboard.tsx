import { requireAgencyWorkspace } from "@/lib/organizations/agency-access";
import { createFileRoute } from "@tanstack/react-router";
import { AgencyDashboard } from "@/components/flights/agency-dashboard";

export const Route = createFileRoute("/_authenticated/_workspace/dashboard")({
  beforeLoad: requireAgencyWorkspace,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Dashboard — Flight Analytics" },
      {
        name: "description",
        content: "Summary of the latest flight search for the selected organization.",
      },
      { property: "og:title", content: "Dashboard — Flight Analytics" },
      {
        property: "og:description",
        content: "Summary of the latest flight search for the selected organization.",
      },
    ],
  }),
  component: AgencyDashboard,
});

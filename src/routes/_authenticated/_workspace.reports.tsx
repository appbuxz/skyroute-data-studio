import { requireAgencyWorkspace } from "@/lib/organizations/agency-access";
import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/common/page-header";

export const Route = createFileRoute("/_authenticated/_workspace/reports")({
  beforeLoad: requireAgencyWorkspace,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Reports — Flight Analytics" },
      { name: "description", content: "Saved fare and route reports for your agency." },
      { property: "og:title", content: "Reports — Flight Analytics" },
      { property: "og:description", content: "Saved fare and route reports for your agency." },
    ],
  }),
  component: Reports,
});

function Reports() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Saved route and fare reports for your organization."
      />
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No reports yet"
        description="Reports will be available after live flight data and saved searches are connected."
      />
    </>
  );
}

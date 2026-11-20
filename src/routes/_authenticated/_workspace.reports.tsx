import { requireAgencyWorkspace } from "@/lib/organizations/agency-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";
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
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        title={t("Reports")}
        description={t("Saved route and fare reports for your organization.")}
      />
      <div className="workspace-report-panel">
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title={t("No reports yet")}
          description={t("Build and export a flight shortlist from Search.")}
          action={<Button asChild variant="outline"><Link to="/search">{t("Open flight search")}</Link></Button>}
        />
      </div>
    </>
  );
}

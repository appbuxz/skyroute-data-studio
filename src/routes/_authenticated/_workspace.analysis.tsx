import { createFileRoute } from "@tanstack/react-router";
import { AgencyAnalysisPage } from "@/components/flights/agency-analysis";

export const Route = createFileRoute("/_authenticated/_workspace/analysis")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Agency Analytics — Flight Analytics" },
      {
        name: "description",
        content:
          "Advanced fare and route analytics for travel agencies. Subscription access is planned.",
      },
    ],
  }),
  component: AgencyAnalysisPage,
});

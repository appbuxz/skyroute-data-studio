import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, CalendarRange, Clock, Plane } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DemoBadge, PageHeader } from "@/components/common/page-header";

export const Route = createFileRoute("/_authenticated/_workspace/analysis")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Flight Analysis — Flight Analytics" },
      { name: "description", content: "Compare fares, carriers and schedules for a selected route." },
      { property: "og:title", content: "Flight Analysis — Flight Analytics" },
      { property: "og:description", content: "Compare fares, carriers and schedules for a selected route." },
    ],
  }),
  component: Analysis,
});

const PANELS = [
  { title: "Price distribution", desc: "Spread of fares across carriers and departure times.", icon: BarChart3 },
  { title: "Carrier comparison", desc: "Fares, stops and durations side by side.", icon: Plane },
  { title: "Date flexibility", desc: "How fares shift on nearby departure dates.", icon: CalendarRange },
  { title: "Schedule overview", desc: "Departure and arrival windows for the route.", icon: Clock },
];

function Analysis() {
  return (
    <>
      <PageHeader
        title="Flight analysis"
        description="Results of a flight search will be analysed here once live data is connected."
        badge={<DemoBadge>Awaiting data source</DemoBadge>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {PANELS.map(({ title, desc, icon: Icon }) => (
          <Card key={title} className="shadow-card">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{desc}</p>
              <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-dashed bg-muted text-xs text-muted-foreground">
                No results to analyse
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

import { requireAgencyWorkspace } from "@/lib/organizations/agency-access";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Plane, Route as RouteIcon, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DemoBadge, EmptyState, PageHeader } from "@/components/common/page-header";

export const Route = createFileRoute("/_authenticated/_workspace/dashboard")({
  beforeLoad: requireAgencyWorkspace,
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Dashboard — Flight Analytics" },
      {
        name: "description",
        content: "Overview of fare trends and search activity for your agency.",
      },
      { property: "og:title", content: "Dashboard — Flight Analytics" },
      {
        property: "og:description",
        content: "Overview of fare trends and search activity for your agency.",
      },
    ],
  }),
  component: Dashboard,
});

const METRICS = [
  { label: "Searches this month", icon: Activity },
  { label: "Tracked routes", icon: RouteIcon },
  { label: "Average fare change", icon: TrendingUp },
  { label: "Carriers monitored", icon: Plane },
];

function Dashboard() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Key metrics will appear here once a flight data source is connected."
        badge={<DemoBadge>Placeholder metrics</DemoBadge>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map(({ label, icon: Icon }) => (
          <Card key={label} className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-highlight" />
            </CardHeader>
            <CardContent>
              <p className="font-display text-2xl font-semibold text-muted-foreground">—</p>
              <p className="mt-1 text-xs text-muted-foreground">No data yet</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8">
        <EmptyState
          icon={<TrendingUp className="h-5 w-5" />}
          title="Fare trend chart"
          description="Historical fare trends for your tracked routes will be charted here."
        />
        <div className="mt-6 flex justify-center">
          <Button asChild>
            <Link to="/search">Go to flight search</Link>
          </Button>
        </div>
      </div>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brand } from "@/components/layout/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Flight Analytics — Flight search and agency analytics" },
      {
        name: "description",
        content:
          "Free flight search for travelers and advanced analytics for travel agencies. Flight Search requires an account; Check My Flight also requires organization access.",
      },
      { property: "og:title", content: "Flight Analytics — Flight search and agency analytics" },
      {
        property: "og:description",
        content:
          "Free flight search for travelers and advanced analytics for travel agencies. Flight Search requires an account; Check My Flight also requires organization access.",
      },
    ],
  }),
  component: Landing,
});

const heroQuietLink =
  "text-slate-50 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-200";
const heroFilledLink =
  "bg-slate-50 text-slate-950 hover:bg-sky-100 focus-visible:ring-2 focus-visible:ring-sky-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900";

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <section className="bg-hero bg-slate-900 text-slate-50">
        <header className="mx-auto flex max-w-6xl flex-col items-start gap-2 px-4 py-3 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <Brand />
          <nav aria-label="Main navigation" className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              asChild
              variant="ghost"
              className={heroQuietLink}
            >
              <a href="#features">Explore</a>
            </Button>
            <Button asChild variant="secondary" className={heroFilledLink}>
              <Link to="/dashboard">Open workspace</Link>
            </Button>
          </nav>
        </header>
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:pb-24 sm:pt-16 md:px-8 md:pt-24">
          <p className="text-sm font-medium uppercase tracking-widest text-sky-200">
            For travelers and travel agencies
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl md:text-6xl">
            Find flights. Make informed travel decisions.
          </h1>
          <p className="mt-6 max-w-xl text-base text-slate-200 md:text-lg">
            Search and compare flights for your next trip, or explore advanced fare and route
            analytics for your agency.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary" className={heroFilledLink}>
              <Link to="/search">Search flights</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className={heroQuietLink}
            >
              <Link to="/analysis">Explore agency analytics</Link>
            </Button>
          </div>
          <p className="mt-6 text-xs text-slate-300">
            Flight Search is free with an account. Check My Flight also requires organization
            access.
          </p>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 md:px-8">
        <h2 className="text-2xl font-semibold md:text-3xl">Two ways to use Flight Analytics</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <Search className="h-5 w-5 text-highlight" />
              <p className="text-sm text-muted-foreground">For travelers · Free search</p>
              <CardTitle>Search and compare flights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Compare fares, carriers and schedules, or use Check My Flight to compare an offer
                against your travel requirements.
              </p>
              <p className="text-sm text-muted-foreground">
                Flight Search requires an account, with no organization membership needed. Check My
                Flight currently requires both an account and organization access.
              </p>
              <Button asChild>
                <Link to="/search">Search flights</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <BarChart3 className="h-5 w-5 text-highlight" />
              <p className="text-sm text-muted-foreground">
                For travel agencies · Subscription planned
              </p>
              <CardTitle>Advanced agency analytics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Explore fare distributions and carrier comparisons from your latest search to
                support your agency’s decisions.
              </p>
              <p className="text-sm text-muted-foreground">
                Advanced agency tools are planned as a subscription offering.
              </p>
              <Button asChild variant="outline">
                <Link to="/analysis">Explore analytics</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">
        © 2026 Flight Analytics
      </footer>
    </div>
  );
}

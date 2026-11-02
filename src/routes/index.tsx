import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Building2, LineChart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/layout/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flight Analytics — Fare intelligence for Kazakhstan travel agencies" },
      { name: "description", content: "Analyse routes, fares and carriers in one workspace built for travel agencies in Kazakhstan." },
      { property: "og:title", content: "Flight Analytics — Fare intelligence for travel agencies" },
      { property: "og:description", content: "Analyse routes, fares and carriers in one workspace built for travel agencies in Kazakhstan." },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: LineChart, title: "Fare trends", text: "Follow how prices move on the routes your clients book most." },
  { icon: BarChart3, title: "Route analysis", text: "Compare carriers, stops and schedules for any origin and destination." },
  { icon: Building2, title: "Built for agencies", text: "Organization workspaces so your whole team shares one view." },
  { icon: ShieldCheck, title: "Transparent data", text: "Every figure shows its source. Nothing is invented." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <section className="bg-hero text-primary-foreground">
        <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
          <Brand />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground">
              <a href="#features">Features</a>
            </Button>
            <Button asChild variant="secondary"><Link to="/dashboard">Open workspace</Link></Button>
          </nav>
        </header>
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-16 md:px-8 md:pt-24">
          <p className="text-sm font-medium uppercase tracking-widest text-highlight">For travel agencies in Kazakhstan</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
            Flight fare intelligence for every route you sell.
          </h1>
          <p className="mt-6 max-w-xl text-base opacity-80 md:text-lg">
            Flight Analytics brings route, fare and carrier insights into one workspace, so your agents quote with confidence.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="secondary"><Link to="/search">Try the search form</Link></Button>
            <Button asChild size="lg" variant="ghost" className="hover:bg-primary-foreground/10 hover:text-primary-foreground">
              <Link to="/dashboard">View dashboard</Link>
            </Button>
          </div>
          <p className="mt-6 text-xs opacity-60">Early preview — live flight data is not connected yet.</p>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-6xl px-4 py-20 md:px-8">
        <h2 className="text-2xl font-semibold md:text-3xl">What the platform will do</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-lg border bg-card p-6 shadow-card">
              <Icon className="h-5 w-5 text-highlight" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t py-8 text-center text-xs text-muted-foreground">© 2026 Flight Analytics</footer>
    </div>
  );
}

import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, BarChart3, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useOrganizationWorkspace,
  type WorkspaceSearch,
} from "@/lib/organizations/workspace-context";
import { getOrganizationMemberships } from "@/lib/organizations/session.functions";
import { analyzeFlightPrices } from "@/lib/flights/analytics";
import { groupFlightSchedules } from "@/lib/flights/schedule-groups";
import type { FlightOffer, OrganizationId } from "@/lib/flights/types";
import { ComparablePrices } from "./comparable-prices";
import { FlightDateTime } from "./flight-date-time";

// Scoped tokens keep the graphite palette confined to analytics, including all states.
const palette = {
  "--background": "oklch(0.19 0.008 260)",
  "--foreground": "oklch(0.95 0.008 260)",
  "--card": "oklch(0.23 0.009 260)",
  "--card-foreground": "oklch(0.95 0.008 260)",
  "--muted": "oklch(0.28 0.012 260)",
  "--muted-foreground": "oklch(0.75 0.015 260)",
  "--border": "oklch(0.35 0.015 260)",
  "--color-border": "oklch(0.35 0.015 260)",
  "--primary": "oklch(0.74 0.13 250)",
  "--primary-foreground": "oklch(0.18 0.02 260)",
  "--accent": "oklch(0.30 0.035 250)",
  "--accent-foreground": "oklch(0.93 0.03 250)",
  "--ring": "oklch(0.74 0.13 250)",
} as CSSProperties;

export function AnalyticsFrame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Agency analytics"
      style={palette}
      className="min-w-0 space-y-4 rounded-xl bg-background p-4 text-foreground md:p-6"
    >
      {children}
    </section>
  );
}

export function AnalyticsState({
  title,
  description,
  retry,
}: {
  title: string;
  description: string;
  retry?: () => void;
}) {
  return (
    <AnalyticsFrame>
      <AnalyticsHeading />
      <Card className="shadow-none">
        <CardContent className="space-y-4 py-8">
          <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="max-w-xl text-sm text-muted-foreground">{description}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/search">
                <ArrowLeft className="h-4 w-4" />
                Back to flight search
              </Link>
            </Button>
            {retry && (
              <Button variant="outline" onClick={retry}>
                Retry membership check
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </AnalyticsFrame>
  );
}

function AnalyticsHeading() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <BarChart3 className="h-5 w-5 text-primary" />
        Agency analytics
      </h1>
      <Badge variant="outline" className="text-muted-foreground">
        Subscription planned
      </Badge>
    </header>
  );
}

export function AgencyAnalysisPage() {
  const workspace = useOrganizationWorkspace();
  const checkMemberships = useServerFn(getOrganizationMemberships);
  const { version, selectedOrganizationId } = workspace;
  const [access, setAccess] = useState<{
    version: number;
    organizationId: OrganizationId | null;
    ids: OrganizationId[];
    error: boolean;
  } | null>(null);

  useEffect(() => {
    let current = true;
    // Always verify on the server, even when browser workspace state has a snapshot.
    void checkMemberships().then(
      (memberships) => {
        if (current)
          setAccess({
            version,
            organizationId: selectedOrganizationId,
            ids: memberships.map((m) => m.organizationId),
            error: false,
          });
      },
      () => {
        if (current)
          setAccess({ version, organizationId: selectedOrganizationId, ids: [], error: true });
      },
    );
    return () => {
      current = false;
    };
  }, [checkMemberships, version, selectedOrganizationId]);

  if (
    workspace.status === "loading" ||
    !access ||
    access.version !== version ||
    access.organizationId !== selectedOrganizationId
  ) {
    return (
      <AnalyticsState
        title="Checking analytics access…"
        description="Verifying your organization membership before showing agency data."
      />
    );
  }
  if (
    access.error ||
    workspace.status === "error" ||
    workspace.error ||
    workspace.authorizationError
  ) {
    return (
      <AnalyticsState
        title="Unable to verify analytics access"
        description="The membership check could not be completed. Try again; no agency data is displayed."
        retry={workspace.reloadMemberships}
      />
    );
  }
  if (
    access.ids.length === 0 ||
    (selectedOrganizationId && !access.ids.includes(selectedOrganizationId))
  ) {
    return (
      <AnalyticsState
        title="Analytics isn’t available for your account"
        description="Agency analytics requires current membership in a travel agency organization. You can still search and compare flights with your account."
      />
    );
  }
  const search = workspace.search;
  if (!selectedOrganizationId || !search || search.organizationId !== selectedOrganizationId) {
    return (
      <AnalyticsState
        title={selectedOrganizationId ? "No flight results yet" : "Select an organization"}
        description={
          selectedOrganizationId
            ? "Run a flight search for your organization to explore fares, carriers and schedules here."
            : "Select an organization before viewing flight analysis."
        }
      />
    );
  }
  return <AnalyticsResults search={search} />;
}

function money(amount: number, currency: string) {
  return `${amount.toLocaleString()} ${currency}`;
}

export function AnalyticsResults({ search }: { search: WorkspaceSearch }) {
  const analysis = analyzeFlightPrices(search.offers);
  const schedules = groupFlightSchedules(search.offers);
  // Compare carrier minima only within the original currency; never mix currencies.
  const carriers = new Map<
    string,
    { carrier: string; currency: string; minimum: number; count: number }
  >();
  for (const offer of search.offers) {
    if (
      !Number.isFinite(offer.price.amount) ||
      offer.price.amount < 0 ||
      !/^[A-Z]{3}$/.test(offer.price.currency)
    )
      continue;
    const key = JSON.stringify([offer.carrier, offer.price.currency]);
    const current = carriers.get(key);
    if (current) {
      current.minimum = Math.min(current.minimum, offer.price.amount);
      current.count++;
    } else
      carriers.set(key, {
        carrier: offer.carrier,
        currency: offer.price.currency,
        minimum: offer.price.amount,
        count: 1,
      });
  }

  return (
    <AnalyticsFrame>
      <AnalyticsHeading />
      <Card className="shadow-none">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div>
            <p className="text-xs text-muted-foreground">Search route</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {search.params.origin} <span className="text-primary">→</span>{" "}
              {search.params.destination}
            </h2>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Departure date</dt>
              <dd className="mt-1">
                <time dateTime={search.params.departureDate}>{search.params.departureDate}</time>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Retrieved</dt>
              <dd className="mt-1">
                <FlightDateTime value={search.fetchedAt} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Offers</dt>
              <dd className="mt-1 font-semibold">{search.offers.length} offers</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      {analysis ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            title="Lowest price"
            value={money(analysis.cheapest.price.amount, analysis.currency)}
          />
          <Metric
            title="Average price"
            value={money(Math.round(analysis.averagePrice), analysis.currency)}
          />
          <Metric
            title="Price spread"
            value={money(analysis.priceSpread, analysis.currency)}
            description={`${analysis.priceSpreadPercent.toFixed(1)}% between highest and lowest fares`}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Price analysis is unavailable. Offers may be empty, invalid, or use different
            currencies. Original offer currencies are retained below.
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Price distribution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            {analysis ? (
              [...search.offers]
                .filter(
                  (o) =>
                    Number.isFinite(o.price.amount) &&
                    o.price.amount >= 0 &&
                    o.price.currency === analysis.currency,
                )
                .sort((a, b) => a.price.amount - b.price.amount)
                .map((offer) => (
                  <div key={offer.id}>
                    <div className="mb-1 flex flex-wrap justify-between gap-1 text-xs">
                      <span>{offer.carrier}</span>
                      <span>{money(offer.price.amount, offer.price.currency)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{
                          width: `${analysis.mostExpensive.price.amount > 0 ? (offer.price.amount / analysis.mostExpensive.price.amount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted-foreground">
                A single valid currency is required to compare fare distributions.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Carrier comparison</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            {[...carriers.entries()].map(([key, data]) => (
              <div
                key={key}
                className="flex flex-wrap justify-between gap-2 border-b pb-2 text-sm last:border-0"
              >
                <div>
                  {data.carrier}
                  <span className="ml-2 text-xs text-muted-foreground">{data.count} offers</span>
                </div>
                <span className="font-semibold">From {money(data.minimum, data.currency)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <ComparablePrices search={search} />
      <Card className="shadow-none">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Flight schedules</CardTitle>
          <p className="text-xs text-muted-foreground">
            {schedules.length} itineraries · One entry per complete route, across fare offers.
          </p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="hidden md:block">
            <Table aria-label="Flight schedules">
              <TableHeader>
                <TableRow>
                  <TableHead>Full itinerary</TableHead>
                  <TableHead>Offers</TableHead>
                  <TableHead>Original prices</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((group) => (
                  <TableRow key={group.key}>
                    <TableCell className="align-top">
                      <ScheduleItinerary offer={group.offer} />
                    </TableCell>
                    <TableCell className="align-top tabular-nums">{group.offers.length}</TableCell>
                    <TableCell className="align-top">
                      <SchedulePrices offers={group.offers} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul aria-label="Flight schedules mobile" className="space-y-3 md:hidden">
            {schedules.map((group) => (
              <li key={group.key} className="space-y-3 rounded-lg border p-3">
                <ScheduleItinerary offer={group.offer} />
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{group.offers.length} offers</span>
                  <SchedulePrices offers={group.offers} />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Price spread is not guaranteed savings. Fare conditions, baggage, transfers and availability
        may differ. Prices reflect the search snapshot, not a live booking quote.
      </p>
    </AnalyticsFrame>
  );
}

function ScheduleItinerary({ offer }: { offer: FlightOffer }) {
  const legs = [
    { label: "Outbound", itinerary: offer.outbound },
    ...(offer.inbound ? [{ label: "Return", itinerary: offer.inbound }] : []),
  ];
  return (
    <div className="space-y-3 text-xs">
      {legs.map(({ label, itinerary }) => (
        <div key={label} className="space-y-2">
          <p className="font-semibold text-primary">
            {label} ·{" "}
            {itinerary?.segments.length
              ? `${itinerary.segments.length} segments`
              : offer.stops === 0
                ? "Direct"
                : `${offer.stops} stop(s)`}
          </p>
          {itinerary?.segments.length ? (
            <ol className="space-y-2">
              {itinerary.segments.map((s, i) => (
                <li key={i} className="space-y-1">
                  <p className="font-medium">
                    {s.origin} → {s.destination} · {s.carrier} {s.flightNumber}
                  </p>
                  <p className="text-muted-foreground">
                    Departure: <FlightDateTime value={s.departureAt} />
                  </p>
                  <p className="text-muted-foreground">
                    Arrival: <FlightDateTime value={s.arrivalAt} />
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="space-y-1">
              <p>
                {offer.origin} → {offer.destination} · {offer.carrier} {offer.flightNumber}
              </p>
              <p className="text-muted-foreground">
                Departure: <FlightDateTime value={offer.departureAt} />
              </p>
              <p className="text-muted-foreground">
                Arrival: <FlightDateTime value={offer.arrivalAt} />
              </p>
              <p className="text-muted-foreground">Segment details unavailable</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SchedulePrices({ offers }: { offers: FlightOffer[] }) {
  const prices = [...new Set(offers.map((o) => money(o.price.amount, o.price.currency)))];
  return (
    <ul className="space-y-1 text-xs tabular-nums">
      {prices.map((price) => (
        <li key={price}>{price}</li>
      ))}
    </ul>
  );
}

function Metric({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description?: string;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="px-4 py-4">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="mt-2 text-xl font-semibold tabular-nums text-primary">{value}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

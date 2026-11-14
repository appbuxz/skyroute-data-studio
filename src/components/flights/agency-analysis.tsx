import { WorkspaceSection } from "@/components/common/workspace-section";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, BarChart3, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { PriceHistogram } from "./price-histogram";
import { FlightDateTime } from "./flight-date-time";

export function AnalyticsFrame({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Agency analytics" className="min-w-0 space-y-4 text-foreground">
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
      <WorkspaceSection title="Flight schedules">
        <p className="text-xs text-muted-foreground">
          {schedules.length} itineraries · One entry per complete route, across fare offers.
        </p>

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
      </WorkspaceSection>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <WorkspaceSection title="Price distribution" contentClassName="space-y-4">
          <PriceHistogram offers={search.offers} />
        </WorkspaceSection>
        <WorkspaceSection title="Carrier comparison">
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
        </WorkspaceSection>
      </div>
      <ComparablePrices search={search} collapsible defaultOpen />
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
  const currencies = new Map<string, number[]>();
  for (const offer of offers) {
    const prices = currencies.get(offer.price.currency) ?? [];
    prices.push(offer.price.amount);
    currencies.set(offer.price.currency, prices);
  }
  return (
    <ul className="space-y-1 text-xs tabular-nums">
      {[...currencies].map(([currency, prices]) => {
        const minimum = Math.min(...prices);
        const maximum = Math.max(...prices);
        return (
          <li key={currency}>
            {minimum === maximum
              ? money(minimum, currency)
              : `${minimum.toLocaleString()}–${maximum.toLocaleString()} ${currency}`}
          </li>
        );
      })}
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

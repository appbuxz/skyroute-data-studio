import { WorkspaceSection } from "@/components/common/workspace-section";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/page-header";
import { useLanguage } from "@/lib/i18n/language-context";
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
import {
  getOrganizationMemberships,
  type OrganizationMembership,
} from "@/lib/organizations/session.functions";
import { analyzeFlightPrices, hasAnalyticPrice } from "@/lib/flights/analytics";
import { groupFlightSchedules } from "@/lib/flights/schedule-groups";
import { CABIN_LABELS, type FlightItinerary, type FlightOffer, type OrganizationId } from "@/lib/flights/types";
import { ComparablePrices } from "./comparable-prices";
import { PriceHistogram } from "./price-histogram";
import { FlightDateTime } from "./flight-date-time";
import { FlightConnection, OfferConnections, formatFlightDuration } from "./flight-itinerary";
import { formatOfferBaggage } from "./flight-shortlist";

function AnalyticsFrame({
  children,
  organization,
}: {
  children: ReactNode;
  organization?: string;
}) {
  const { t } = useLanguage();
  return (
    <section
      aria-label={t("Agency analytics")}
      className="workspace-analysis min-w-0 space-y-4 text-foreground"
    >
      <div>
        <PageHeader
          title={t("Agency analytics")}
          description={t("Compare the fares and schedules from your agency’s latest search.")}
        />
        {organization && (
          <p className="flex min-w-0 items-start gap-2 text-lg font-semibold">
            <Building2 className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 break-words">{organization}</span>
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function AnalyticsState({
  title,
  description,
  retry,
  organization,
}: {
  title: string;
  description: string;
  retry?: () => void;
  organization?: string;
}) {
  const { t } = useLanguage();
  return (
    <AnalyticsFrame organization={organization}>
      <Card className="shadow-none">
        <CardContent className="space-y-4 py-8">
          <ShieldCheck className="h-7 w-7 text-primary" aria-hidden="true" />
          <h2 className="text-xl font-semibold">{t(title)}</h2>
          <p className="max-w-xl text-sm text-muted-foreground">{t(description)}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/search">
                <ArrowLeft className="h-4 w-4" />
                {t("Back to flight search")}
              </Link>
            </Button>
            {retry && (
              <Button variant="outline" onClick={retry}>
                {t("Retry membership check")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </AnalyticsFrame>
  );
}

export function AgencyAnalysisPage() {
  const workspace = useOrganizationWorkspace();
  const checkMemberships = useServerFn(getOrganizationMemberships);
  const { version, selectedOrganizationId } = workspace;
  const [access, setAccess] = useState<{
    version: number;
    organizationId: OrganizationId | null;
    memberships: OrganizationMembership[];
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
            memberships,
            error: false,
          });
      },
      () => {
        if (current)
          setAccess({
            version,
            organizationId: selectedOrganizationId,
            memberships: [],
            error: true,
          });
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
  const membership = access.memberships.find(
    (item) => item.organizationId === selectedOrganizationId,
  );
  if (access.memberships.length === 0 || (selectedOrganizationId && !membership)) {
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
        organization={membership?.organizationName}
        title={selectedOrganizationId ? "No flight results yet" : "Select an organization"}
        description={
          selectedOrganizationId
            ? "Run a flight search for your organization to explore fares, carriers and schedules here."
            : "Select an organization before viewing flight analysis."
        }
      />
    );
  }
  return <AnalyticsResults search={search} organization={membership?.organizationName} />;
}

export function AnalyticsResults({
  search,
  organization,
}: {
  search: WorkspaceSearch;
  organization?: string;
}) {
  const { t, number, date } = useLanguage();
  const money = (amount: number, currency: string) => `${number(amount)} ${currency}`;
  const analysis = analyzeFlightPrices(search.offers);
  const schedules = groupFlightSchedules(search.offers);
  // Compare carrier minima only within the original currency; never mix currencies.
  const carriers = new Map<
    string,
    { carrier: string; currency: string; minimum: number; count: number }
  >();
  for (const offer of search.offers) {
    if (!hasAnalyticPrice(offer)) continue;
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
    <AnalyticsFrame organization={organization}>
      <Card className="shadow-none">
        <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div>
            <p className="text-xs text-muted-foreground">{t("Search route")}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {search.params.origin} <span className="text-primary">→</span>{" "}
              {search.params.destination}
            </h2>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("Departure date")}</dt>
              <dd className="mt-1">
                <time dateTime={search.params.departureDate}>
                  {date(new Date(search.params.departureDate), "UTC")}
                </time>
              </dd>
            </div>
            {search.params.returnDate && (
              <div>
                <dt className="text-xs text-muted-foreground">{t("Return date")}</dt>
                <dd className="mt-1">
                  <time dateTime={search.params.returnDate}>
                    {date(new Date(search.params.returnDate), "UTC")}
                  </time>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">{t("Passengers")}</dt>
              <dd className="mt-1">{number(search.params.passengers)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("Cabin class")}</dt>
              <dd className="mt-1">{t(CABIN_LABELS[search.params.cabinClass])}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("Retrieved")}</dt>
              <dd className="mt-1">
                <FlightDateTime value={search.fetchedAt} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("Offers")}</dt>
              <dd className="mt-1 font-semibold">
                {t("{count} offers", { count: number(search.offers.length) })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <KeyOffers search={search} cheapest={analysis?.cheapest} />
      {analysis ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            title={t("Lowest price")}
            value={money(analysis.cheapest.price.amount, analysis.currency)}
          />
          <Metric
            title={t("Highest price")}
            value={money(analysis.mostExpensive.price.amount, analysis.currency)}
          />
          <Metric
            title={t("Average price")}
            value={money(Math.round(analysis.averagePrice), analysis.currency)}
          />
          <Metric
            title={t("Price spread")}
            value={money(analysis.priceSpread, analysis.currency)}
            description={t("{percent}% between highest and lowest fares", {
              percent: number(analysis.priceSpreadPercent, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }),
            })}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            {t(
              "Price analysis is unavailable. Offers may be empty, invalid, or use different currencies. Original offer currencies are retained below.",
            )}
          </CardContent>
        </Card>
      )}
      <WorkspaceSection title="Offer comparison" label="Flight schedules">
        <p className="text-xs text-muted-foreground">
          {t(
            "Itineraries: {count}. Fares are grouped by schedule, with prices shown in their original currencies.",
            { count: number(schedules.length) },
          )}
        </p>

        <div className="workspace-analysis-table hidden lg:block">
          <Table aria-label={t("Flight schedules")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Full itinerary")}</TableHead>
                <TableHead>{t("Offers")}</TableHead>
                <TableHead>{t("Original prices")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((group) => (
                <TableRow key={group.key}>
                  <TableCell className="align-top">
                    <ScheduleItinerary offer={group.offer} />
                  </TableCell>
                  <TableCell className="align-top tabular-nums">
                    {number(group.offers.length)}
                  </TableCell>
                  <TableCell className="align-top">
                    <SchedulePrices offers={group.offers} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul
          aria-label={t("Flight schedules mobile")}
          className="workspace-analysis-list space-y-3 lg:hidden"
        >
          {schedules.map((group) => (
            <li key={group.key} className="space-y-3 rounded-lg border p-3">
              <ScheduleItinerary offer={group.offer} />
              <div className="space-y-2 border-t pt-2 text-sm">
                <span className="text-muted-foreground">
                  {t("{count} offers", { count: number(group.offers.length) })}
                </span>
                <SchedulePrices offers={group.offers} />
              </div>
            </li>
          ))}
        </ul>
      </WorkspaceSection>
      <ComparablePrices search={search} collapsible defaultOpen />
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
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("{count} offers", { count: number(data.count) })}
                </span>
              </div>
              <span className="font-semibold">
                {t("From {price}", { price: money(data.minimum, data.currency) })}
              </span>
            </div>
          ))}
        </WorkspaceSection>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          "Price spread is not guaranteed savings. Fare conditions, baggage, transfers and availability may differ. Prices reflect the search snapshot, not a live booking quote.",
        )}
      </p>
    </AnalyticsFrame>
  );
}

function itineraryMinutes(itinerary?: FlightItinerary, summary?: FlightOffer) {
  const minutes = itinerary?.durationMinutes;
  if (minutes !== undefined && Number.isFinite(minutes) && minutes > 0) {
    return Math.round(minutes);
  }
  const departure = itinerary?.segments[0]?.departureAt ?? summary?.departureAt;
  const arrival = itinerary?.segments.at(-1)?.arrivalAt ?? summary?.arrivalAt;
  const timezone = /(?:Z|[+-]\d{2}:?\d{2})$/i;
  if (!departure || !arrival || !timezone.test(departure) || !timezone.test(arrival)) return;
  const elapsed = Math.round((Date.parse(arrival) - Date.parse(departure)) / 60_000);
  if (elapsed > 0) return elapsed;
}

function KeyOffers({ search, cheapest }: { search: WorkspaceSearch; cheapest?: FlightOffer }) {
  const language = useLanguage();
  const { t, number } = language;
  const money = (amount: number, currency: string) => `${number(amount)} ${currency}`;
  const duration = (offer: FlightOffer) => {
    const outbound = itineraryMinutes(offer.outbound, offer);
    if (outbound === undefined) return;
    if (!search.params.returnDate && !offer.inbound) return outbound;
    const inbound = itineraryMinutes(offer.inbound);
    if (inbound !== undefined) return outbound + inbound;
  };
  const cheapestMinutes = cheapest && duration(cheapest);
  let fastest = cheapestMinutes === undefined ? undefined : cheapest;
  let fastestMinutes = cheapestMinutes;
  for (const offer of search.offers) {
    const minutes = duration(offer);
    if (minutes !== undefined && (fastestMinutes === undefined || minutes < fastestMinutes)) {
      fastest = offer;
      fastestMinutes = minutes;
    }
  }
  const sameOffer = cheapest !== undefined && cheapest === fastest;
  const picks = [
    { offer: cheapest, minutes: cheapestMinutes, title: sameOffer ? "Cheapest and fastest" : "Cheapest" },
    { offer: sameOffer ? undefined : fastest, minutes: fastestMinutes, title: "Fastest" },
  ];
  if (!cheapest && !fastest) return null;

  const timeDifference = cheapestMinutes !== undefined && fastestMinutes !== undefined
    ? formatFlightDuration(cheapestMinutes - fastestMinutes, language)
    : undefined;
  const priceDifference = cheapest && fastest && hasAnalyticPrice(fastest) &&
    cheapest.price.currency === fastest.price.currency
    ? fastest.price.amount - cheapest.price.amount
    : undefined;

  return (
    <div className="space-y-2">
      <div className="grid gap-3 lg:grid-cols-2">
        {picks.map(({ offer, minutes, title }) => offer && (
          <Card key={title} className="min-w-0 shadow-none">
            <CardContent className="space-y-1 break-words py-3 text-sm">
              <h3 className="font-semibold text-primary">{t(title)}</h3>
              <p className="font-medium">{offer.carrier} · {offer.flightNumber}</p>
              <p className="text-xs text-muted-foreground">
                {t("Departure:")} <FlightDateTime value={offer.departureAt} />
              </p>
              <p className="flex flex-wrap gap-x-3 gap-y-1">
                {hasAnalyticPrice(offer) && (
                  <span className="font-semibold">{money(offer.price.amount, offer.price.currency)}</span>
                )}
                {minutes !== undefined && <span>{formatFlightDuration(minutes, language)}</span>}
              </p>
              {[
                { label: "Outbound", stops: offer.stops },
                { label: "Return", stops: offer.inbound?.segments.length ? offer.inbound.segments.length - 1 : undefined },
              ].map(({ label, stops }) => stops !== undefined && Number.isInteger(stops) && stops >= 0 && (
                <p key={label} className="text-xs text-muted-foreground">
                  {(search.params.returnDate || offer.inbound) && `${t(label)} · `}
                  {stops === 0 ? t("Direct flight") : stops === 1 ? t("1 stop") : t("{count} stops", { count: number(stops) })}
                </p>
              ))}
              <OfferConnections offer={offer} className="space-y-1 text-xs text-muted-foreground" />
              {(["checked", "cabin"] as const).map((kind) => {
                const allowance = formatOfferBaggage(offer, kind, language);
                return allowance !== t("No data") && (
                  <p key={kind} className="text-xs text-muted-foreground">
                    {t(kind === "checked" ? "Checked baggage" : "Cabin baggage")} · {allowance}
                  </p>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
      {cheapest && fastest && !sameOffer && (timeDifference || priceDifference !== undefined) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {timeDifference && <span>{t("Fastest option saves {duration}", { duration: timeDifference })}</span>}
          {priceDifference === 0 && <span>{t("Same price")}</span>}
          {priceDifference !== undefined && priceDifference > 0 && (
            <span>{t("Fastest option costs {price} more", {
              price: money(priceDifference, cheapest.price.currency),
            })}</span>
          )}
        </p>
      )}
    </div>
  );
}

function ScheduleItinerary({ offer }: { offer: FlightOffer }) {
  const language = useLanguage();
  const { t, number } = language;
  const legs = [
    { label: "Outbound", itinerary: offer.outbound, stops: offer.stops },
    ...(offer.inbound
      ? [
          {
            label: "Return",
            itinerary: offer.inbound,
            stops: offer.inbound.segments.length ? offer.inbound.segments.length - 1 : undefined,
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-3 text-xs">
      {legs.map(({ label, itinerary, stops }) => (
        <div key={label} className="space-y-2">
          <p className="font-semibold text-primary">
            {t(label)}
            {stops !== undefined &&
              ` · ${stops === 0 ? t("Direct flight") : stops === 1 ? t("1 stop") : t("{count} stops", { count: number(stops) })}`}
            {itinerary?.durationMinutes !== undefined &&
              ` · ${formatFlightDuration(itinerary.durationMinutes, language)}`}
          </p>
          {itinerary?.segments.length ? (
            <ol className="space-y-2">
              {itinerary.segments.map((s, i, segments) => (
                <li key={i} className="space-y-1">
                  <p className="font-medium">
                    {s.origin} → {s.destination} · {s.carrier} {s.flightNumber}
                  </p>
                  <p className="text-muted-foreground">
                    {t("Departure:")} <FlightDateTime value={s.departureAt} />
                  </p>
                  <p className="text-muted-foreground">
                    {t("Arrival:")} <FlightDateTime value={s.arrivalAt} />
                  </p>
                  {segments[i + 1] && (
                    <p className="font-medium">
                      <FlightConnection segment={s} next={segments[i + 1]!} />
                    </p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="space-y-1">
              <p>
                {offer.origin} → {offer.destination} · {offer.carrier} {offer.flightNumber}
              </p>
              <p className="text-muted-foreground">
                {t("Departure:")} <FlightDateTime value={offer.departureAt} />
              </p>
              <p className="text-muted-foreground">
                {t("Arrival:")} <FlightDateTime value={offer.arrivalAt} />
              </p>
              <p className="text-muted-foreground">{t("Segment details unavailable")}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SchedulePrices({ offers }: { offers: FlightOffer[] }) {
  const language = useLanguage();
  const { t, number } = language;
  const currencies = new Map<string, number[]>();
  for (const offer of offers) {
    const prices = currencies.get(offer.price.currency) ?? [];
    prices.push(offer.price.amount);
    currencies.set(offer.price.currency, prices);
  }
  return (
    <div className="min-w-0 space-y-2">
      <ul className="space-y-1 text-sm font-semibold tabular-nums">
        {[...currencies].map(([currency, prices]) => {
          const minimum = Math.min(...prices);
          const maximum = Math.max(...prices);
          return (
            <li key={currency}>
              {minimum === maximum
                ? `${number(minimum)} ${currency}`
                : `${number(minimum)}–${number(maximum)} ${currency}`}
            </li>
          );
        })}
      </ul>
      <details className="flight-offer-details text-xs">
        <summary className="cursor-pointer rounded-sm font-medium text-primary">
          {t("Prices and baggage by offer")}
        </summary>
        <ul className="mt-2 grid gap-2">
          {offers.map((offer) => (
            <li key={offer.id} className="min-w-0 rounded-md border bg-background p-2">
              <p className="font-semibold tabular-nums">
                {number(offer.price.amount)} {offer.price.currency}
              </p>
              {(["checked", "cabin"] as const).map((kind) => (
                <p key={kind} className="text-muted-foreground">
                  {t(kind === "checked" ? "Checked baggage" : "Cabin baggage")} ·{" "}
                  {formatOfferBaggage(offer, kind, language)}
                </p>
              ))}
            </li>
          ))}
        </ul>
      </details>
    </div>
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

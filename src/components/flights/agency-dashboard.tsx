import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Plane, Route as RouteIcon, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/page-header";
import { useOrganizationWorkspace } from "@/lib/organizations/workspace-context";
import {
  getOrganizationMemberships,
  type OrganizationMembership,
} from "@/lib/organizations/session.functions";
import type { OrganizationId } from "@/lib/flights/types";
import { summarizeAgencySearch } from "@/lib/flights/search-summary";
import { useLanguage } from "@/lib/i18n/language-context";
import { FlightDateTime } from "./flight-date-time";

export function AgencyDashboard() {
  const { t, number, date } = useLanguage();
  const workspace = useOrganizationWorkspace();
  const checkMemberships = useServerFn(getOrganizationMemberships);
  const { selectedOrganizationId, version } = workspace;
  const [access, setAccess] = useState<{
    version: number;
    organizationId: OrganizationId | null;
    memberships: OrganizationMembership[];
    error: boolean;
  } | null>(null);

  useEffect(() => {
    document.title = `${t("Dashboard")} — Flight Analytics`;
  }, [t]);
  useEffect(() => {
    let current = true;
    // Recheck current membership before displaying an organization-owned snapshot,
    // including selection changes within the already mounted workspace layout.
    void checkMemberships().then(
      (memberships) => {
        if (current)
          setAccess({ version, organizationId: selectedOrganizationId, memberships, error: false });
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
  }, [checkMemberships, selectedOrganizationId, version]);

  const frame = (children: ReactNode) => (
    <section aria-label={t("Latest agency search")} className="space-y-5">
      <PageHeader
        title={t("Dashboard")}
        description={t("Summary of the latest search for the selected organization.")}
      />
      {children}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          "Only this session’s latest search is shown. Switching organizations or reloading clears these results.",
        )}
      </p>
    </section>
  );
  const state = (title: string, description: string, retry = false) =>
    frame(
      <Card>
        <CardContent className="space-y-4 py-6">
          <h2 className="text-lg font-semibold">{t(title)}</h2>
          <p className="text-sm text-muted-foreground">{t(description)}</p>
          <div className="flex flex-wrap gap-3">
            <SearchLink />
            {retry && (
              <Button variant="outline" onClick={workspace.reloadMemberships}>
                {t("Retry membership check")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>,
    );

  if (
    workspace.status === "loading" ||
    !access ||
    access.version !== version ||
    access.organizationId !== selectedOrganizationId
  ) {
    return frame(
      <p role="status" className="text-sm text-muted-foreground">
        {t("Loading search summary…")}
      </p>,
    );
  }
  if (
    access.error ||
    workspace.status === "error" ||
    workspace.error ||
    workspace.authorizationError
  ) {
    return state(
      "Unable to verify organization access",
      "Try again to verify membership before viewing this organization’s search summary.",
      true,
    );
  }
  if (
    access.memberships.length === 0 ||
    (selectedOrganizationId &&
      !access.memberships.some(
        (membership) => membership.organizationId === selectedOrganizationId,
      ))
  ) {
    return state(
      "Organization access required",
      "Current organization membership is required to view its search summary.",
      true,
    );
  }
  if (!selectedOrganizationId) {
    return state("Select an organization", "Select an organization to view its latest search.");
  }
  // Personal results are never published here. Do not accept a snapshot for another tenant.
  const search =
    workspace.canSearch && workspace.search?.organizationId === selectedOrganizationId
      ? workspace.search
      : null;
  if (!search)
    return state(
      "No search results in this session",
      "Run a search for the selected organization to see its summary.",
    );

  const summary = summarizeAgencySearch(search.offers);
  const organization = access.memberships.find(
    (membership) => membership.organizationId === selectedOrganizationId,
  )!;
  return frame(
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-3">
          <CardTitle role="heading" aria-level={2} className="text-base">
            {t("Latest search")}
          </CardTitle>
          <Badge variant="secondary">{organization.organizationName}</Badge>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end justify-between gap-5">
          <dl className="flex flex-wrap gap-x-8 gap-y-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("Search route")}</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {search.params.origin} <span className="text-primary">→</span>{" "}
                {search.params.destination}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("Departure date")}</dt>
              <dd className="mt-1">
                <time dateTime={search.params.departureDate}>
                  {date(new Date(`${search.params.departureDate}T00:00:00Z`), "UTC")}
                </time>
              </dd>
            </div>
            {search.params.returnDate && (
              <div>
                <dt className="text-xs text-muted-foreground">{t("Return date")}</dt>
                <dd className="mt-1">
                  <time dateTime={search.params.returnDate}>
                    {date(new Date(`${search.params.returnDate}T00:00:00Z`), "UTC")}
                  </time>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">{t("Retrieved")}</dt>
              <dd className="mt-1">
                <FlightDateTime value={search.fetchedAt} />
              </dd>
            </div>
          </dl>
          {summary.offerCount > 0 && (
            <div className="flex flex-wrap gap-2">
              <SearchLink />
              <Button asChild>
                <Link to="/analysis">
                  {t("Open analytics")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric
          title={t("Offers")}
          value={number(summary.offerCount)}
          icon={<Plane className="h-4 w-4 text-primary" aria-hidden="true" />}
        />
        <Metric
          title={t("Unique itineraries")}
          value={number(summary.routeCount)}
          icon={<RouteIcon className="h-4 w-4 text-primary" aria-hidden="true" />}
        />
      </div>
      {summary.offerCount === 0 ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            <h2 className="text-lg font-semibold">{t("The latest search returned no offers")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("No flights were found for this route and date. Try another search.")}
            </p>
            <SearchLink />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle role="heading" aria-level={2} className="text-base">
              {t("Minimum prices by currency")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.minimumPrices.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summary.minimumPrices.map(({ currency, amount }) => (
                  <li key={currency} className="rounded-lg border bg-background p-4">
                    <p className="text-xs text-muted-foreground">
                      {t("Minimum price in {currency}", { currency })}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {number(amount)} {currency}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("No valid prices available.")}</p>
            )}
          </CardContent>
        </Card>
      )}
    </>,
  );
}

function SearchLink() {
  const { t } = useLanguage();
  return (
    <Button asChild variant="outline">
      <Link to="/search">
        <Search aria-hidden="true" className="h-4 w-4" />
        {t("Go to flight search")}
      </Link>
    </Button>
  );
}
function Metric({ title, value, icon }: { title: string; value: string; icon: ReactNode }) {
  return (
    <Card role="region" aria-label={title}>
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm text-muted-foreground">{title}</h2>
          {icon}
        </div>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

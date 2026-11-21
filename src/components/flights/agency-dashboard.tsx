import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Building2, Info, LoaderCircle, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  const frame = (children: ReactNode, organization?: string) => (
    <section aria-label={t("Latest agency search")} className="workspace-dashboard space-y-4">
      <div>
        <PageHeader
          title={t("Dashboard")}
          description={t("Summary of the latest search for the selected organization.")}
        />
        {organization && (
          <p className="flex min-w-0 items-start gap-2 text-lg font-semibold">
            <Building2 className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="break-words min-w-0">{organization}</span>
          </p>
        )}
      </div>
      {children}
      {organization && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("This tab keeps the latest successful search for each organization.")}
        </p>
      )}
    </section>
  );
  const state = (
    title: string,
    description: string,
    options?: { retry?: boolean; error?: boolean; organization?: string },
  ) =>
    frame(
      <Card className="shadow-none">
        <CardContent className="space-y-3 py-5">
          <div role={options?.error ? "alert" : undefined} className="space-y-1">
            <h2 className="flex items-start gap-2 text-lg font-semibold">
              {options?.error && (
                <Info className="mt-1 size-4 shrink-0 text-destructive" aria-hidden="true" />
              )}
              {t(title)}
            </h2>
            <p className="text-sm text-muted-foreground">{t(description)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SearchLink />
            {options?.retry && (
              <Button variant="outline" onClick={workspace.reloadMemberships}>
                {t("Retry membership check")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>,
      options?.organization,
    );

  if (
    workspace.status === "loading" ||
    !access ||
    access.version !== version ||
    access.organizationId !== selectedOrganizationId
  ) {
    return frame(
      <Card className="shadow-none">
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <LoaderCircle
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <p role="status">{t("Loading search summary…")}</p>
        </CardContent>
      </Card>,
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
      { retry: true, error: true },
    );
  }
  const organization = access.memberships.find(
    (membership) => membership.organizationId === selectedOrganizationId,
  );
  if (access.memberships.length === 0 || (selectedOrganizationId && !organization)) {
    return state(
      "Organization access required",
      "Current organization membership is required to view its search summary.",
      { retry: true },
    );
  }
  if (!organization) {
    return state("Select an organization", "Select an organization to view its latest search.");
  }

  // Only the verified active organization can contribute a dashboard snapshot.
  const search =
    workspace.canSearch && workspace.search?.organizationId === selectedOrganizationId
      ? workspace.search
      : null;
  if (!search)
    return state(
      "No search results in this session",
      "Run a search for the selected organization to see its summary.",
      { organization: organization.organizationName },
    );

  const summary = summarizeAgencySearch(search.offers);
  const direct = search.offers.filter((offer) => offer.stops === 0).length;
  return frame(
    <>
      <div className="dashboard-metrics grid grid-cols-2 gap-3">
        <Metric title={t("Offers")} value={number(summary.offerCount)} />
        <Metric title={t("Unique itineraries")} value={number(summary.routeCount)} />
        <Card className="col-span-2 shadow-none sm:col-span-1">
          <CardContent className="py-4">
            <h2 className="text-sm text-muted-foreground">{t("Minimum prices by currency")}</h2>
            {summary.minimumPrices.length ? (
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {summary.minimumPrices.map(({ currency, amount }) => (
                  <li key={currency} className="break-words text-xl font-semibold tabular-nums">
                    {number(amount)} {currency}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("No valid prices available.")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="dashboard-columns grid items-start gap-3">
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle role="heading" aria-level={2} className="text-base">
              {t("Latest search")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl>
              <dt className="sr-only">{t("Search route")}</dt>
              <dd className="text-2xl font-semibold">
                {search.params.origin} <span className="text-primary">→</span>{" "}
                {search.params.destination}
              </dd>
            </dl>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("Departure date")}</dt>
                <dd>
                  <time dateTime={search.params.departureDate}>
                    {date(new Date(search.params.departureDate), "UTC")}
                  </time>
                </dd>
              </div>
              {search.params.returnDate && (
                <div>
                  <dt className="text-xs text-muted-foreground">{t("Return date")}</dt>
                  <dd>
                    <time dateTime={search.params.returnDate}>
                      {date(new Date(search.params.returnDate), "UTC")}
                    </time>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted-foreground">{t("Retrieved")}</dt>
                <dd>
                  <FlightDateTime value={search.fetchedAt} />
                </dd>
              </div>
            </dl>
            {summary.offerCount === 0 && (
              <div className="space-y-1 border-t pt-3">
                <h3 className="text-sm font-semibold">
                  {t("The latest search returned no offers")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("No flights were found for this route and date. Try another search.")}
                </p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <SearchLink />
              {summary.offerCount > 0 && (
                <Button asChild>
                  <Link to="/analysis">
                    {t("Open analytics")}
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        {summary.offerCount > 0 && (
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <CardTitle role="heading" aria-level={2} className="text-base">
                {t("Offer breakdown")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: t("Direct flight offers"), count: direct },
                { label: t("Offers with connections"), count: summary.offerCount - direct },
              ].map(({ label, count }) => (
                <div key={label} className="space-y-1">
                  <p className="flex justify-between gap-2 text-sm">
                    <span>{label}</span>
                    <strong className="tabular-nums">{number(count)}</strong>
                  </p>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(count / summary.offerCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </>,
    organization.organizationName,
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
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card role="region" aria-label={title} className="shadow-none">
      <CardContent className="py-4">
        <h2 className="text-sm text-muted-foreground">{title}</h2>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

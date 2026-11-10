import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Plane, Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { analyzeFlightPrices } from "@/lib/flights/analytics";
import { useOrganizationWorkspace } from "@/lib/organizations/workspace-context";
import { ComparablePrices } from "@/components/flights/comparable-prices";

export const Route = createFileRoute("/_authenticated/_workspace/analysis")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "Flight Analysis — Flight Analytics" },
      {
        name: "description",
        content: "Analyse flight offers from the latest search.",
      },
    ],
  }),
  component: Analysis,
});

function Analysis() {
  const workspace = useOrganizationWorkspace();
  const search = workspace.search;
  const loading = workspace.status === "loading";

  if (loading) {
    return (
      <>
        <PageHeader title="Flight analysis" description="Loading the latest search results." />
        <p className="text-sm text-muted-foreground">Loading analysis…</p>
      </>
    );
  }

  if (!search) {
    return (
      <>
        <PageHeader
          title="Flight analysis"
          description="Analyse flight offers from your latest search."
        />

        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm text-muted-foreground">
              {workspace.error ??
                workspace.authorizationError ??
                (!workspace.selectedOrganizationId
                  ? "Select an organization before viewing flight analysis."
                  : "No flight results for the selected organization. Run a search to analyze offers.")}
            </p>

            <Link to="/search" className="inline-block text-sm font-medium text-primary underline">
              Go to flight search
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const analysis = analyzeFlightPrices(search.offers);

  const carriers = Array.from(
    search.offers.reduce(
      (map, offer) => {
        const current = map.get(offer.carrier);

        if (!current || offer.price.amount < current.price) {
          map.set(offer.carrier, {
            price: offer.price.amount,
            currency: offer.price.currency,
            count: (current?.count ?? 0) + 1,
          });
        } else {
          current.count += 1;
        }

        return map;
      },
      new Map<
        string,
        {
          price: number;
          currency: string;
          count: number;
        }
      >(),
    ),
  ).sort((a, b) => a[1].price - b[1].price);

  return (
    <>
      <PageHeader
        title="Flight analysis"
        description={`${search.params.origin} → ${search.params.destination} · ${search.params.departureDate}`}
      />

      <p className="mb-5 text-sm text-muted-foreground">
        {search.offers.length} offers · Retrieved: {new Date(search.fetchedAt).toLocaleString()}
      </p>

      <div className="mb-5"><ComparablePrices search={search} /></div>

      {!analysis ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Price analysis is unavailable. Offers may be empty, invalid, or use different
            currencies.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-5 grid gap-4 md:grid-cols-3">
            <Metric
              title="Lowest price"
              value={`${analysis.cheapest.price.amount.toLocaleString()} ${analysis.currency}`}
            />

            <Metric
              title="Average price"
              value={`${Math.round(analysis.averagePrice).toLocaleString()} ${analysis.currency}`}
            />

            <Metric
              title="Price spread"
              value={`${analysis.priceSpread.toLocaleString()} ${analysis.currency}`}
              description={`${analysis.priceSpreadPercent.toFixed(1)}% between highest and lowest fares`}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Price distribution
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {[...search.offers]
                  .sort((a, b) => a.price.amount - b.price.amount)
                  .map((offer) => (
                    <div key={offer.id}>
                      <div className="mb-1 flex justify-between gap-2 text-xs">
                        <span>{offer.carrier}</span>
                        <span>
                          {offer.price.amount.toLocaleString()} {offer.price.currency}
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${
                              analysis.mostExpensive.price.amount > 0
                                ? (offer.price.amount / analysis.mostExpensive.price.amount) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Plane className="h-4 w-4" />
                  Carrier comparison
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {carriers.map(([carrier, data]) => (
                  <div
                    key={carrier}
                    className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-0"
                  >
                    <span>{carrier}</span>

                    <span className="font-semibold">
                      From {data.price.toLocaleString()} {data.currency}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4" />
                  Flight schedules
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                {search.offers.map((offer) => (
                  <div
                    key={offer.id}
                    className="grid gap-2 border-b pb-3 text-sm last:border-0 md:grid-cols-3"
                  >
                    <div>
                      <p className="font-medium">
                        {offer.carrier} · {offer.flightNumber}
                      </p>
                      <p className="text-muted-foreground">
                        {offer.stops === 0 ? "Direct" : `${offer.stops} stop(s)`}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Departure</p>
                      <p>{offer.departureAt}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Arrival</p>
                      <p>{offer.arrivalAt}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            Price spread is not guaranteed savings. Fare conditions, baggage, transfers and
            availability may differ. Prices reflect the search snapshot, not a live booking quote.
          </p>
        </>
      )}
    </>
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
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{title}</p>

        <p className="mt-2 text-2xl font-bold">{value}</p>

        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

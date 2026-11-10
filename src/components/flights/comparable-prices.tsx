import type { WorkspaceSearch } from "@/lib/organizations/workspace-context";
import { analyzeComparablePrices } from "@/lib/flights/comparable-prices";
import { FlightDateTime } from "./flight-date-time";

export function ComparablePrices({ search }: { search: WorkspaceSearch }) {
  // Current search contract sends every passenger as ADT to Travelport.
  const passengers = { adults: search.params.passengers, children: 0, infants: 0 };
  const groups = analyzeComparablePrices(search.offers.map((offer) => ({ offer, passengers })));
  return (
    <section aria-label="Comparable offer prices" className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Potential price difference</h2>
      <p className="text-sm text-muted-foreground">
        Fare conditions not fully verified. Differences are based on this search snapshot, not
        guaranteed savings or a booking quote.
      </p>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comparable offer groups found.</p>
      ) : (
        <ul className="space-y-3">
          {groups.map((group, index) => {
            const offer = group.offers[0]!;
            return (
              <li key={index} className="space-y-1 text-sm">
                <p className="font-medium">
                  {offer
                    .outbound!.segments.map(
                      (s) => `${s.origin} → ${s.destination} (${s.carrier} ${s.flightNumber})`,
                    )
                    .join(" · ")}
                </p>
                <p>
                  <FlightDateTime value={offer.departureAt} /> · {passengers.adults} adult(s) ·{" "}
                  {offer.cabinClass} · {group.offers.length} offers
                </p>
                <p>
                  Minimum: {group.minimumPrice.toLocaleString()} {group.currency} · Maximum:{" "}
                  {group.maximumPrice.toLocaleString()} {group.currency}
                </p>
                <p>
                  Potential price difference: {group.potentialPriceDifference.toLocaleString()}{" "}
                  {group.currency}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
